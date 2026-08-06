import { eq, sql } from "drizzle-orm";
import { withOrg, type TenantTx } from "../db/tenant.js";
import {
  incidents,
  incidentServices,
  incidentRccas,
  projects,
  teams,
  oncallEscalationPolicies,
  type RccaSnapshot,
} from "../db/schema.js";
import { autoAttachRunbooks } from "./runbook-attach.js";
import { ensureRccaTemplate } from "./rcca-template.js";
import { loadPolicy, resolveLevelTargets, teamResponders } from "./escalate.js";
import { notifyIncident } from "./notify.js";

/**
 * Shared incident-declare service — the ONE path that creates an incident, used by
 * both the manual declare route (a human, owner/admin) and automated producers (a
 * synthetic check opening an incident on a confirmed failure). Keeping a single
 * implementation means the two can never drift: both allocate the per-org number,
 * attach services, derive the owner, auto-attach runbooks, freeze the RCCA snapshot,
 * and page the first responders identically. The only differences are carried in the
 * input: who (if anyone) declared it, and the intake `source`.
 */

export type IncidentRow = typeof incidents.$inferSelect;

/** Resolve a team by its per-org key (id + display fields). */
export async function teamByKey(tx: TenantTx, key: string) {
  return tx
    .select({ id: teams.id, key: teams.key, name: teams.name })
    .from(teams)
    .where(eq(teams.key, key))
    .limit(1)
    .then((r) => r[0] ?? null);
}

/** Resolve an escalation policy by its per-org key. */
export async function policyByKey(tx: TenantTx, key: string) {
  return tx
    .select({ id: oncallEscalationPolicies.id, key: oncallEscalationPolicies.key })
    .from(oncallEscalationPolicies)
    .where(eq(oncallEscalationPolicies.key, key))
    .limit(1)
    .then((r) => r[0] ?? null);
}

/** A point-in-time copy of the org RCCA template, frozen onto an incident at declare. */
export async function snapshotTemplate(tx: TenantTx, orgId: string): Promise<RccaSnapshot> {
  const t = await ensureRccaTemplate(tx, orgId);
  return { requiredSeverities: t.requiredSeverities, fields: t.fields };
}

export type DeclareInput = {
  orgId: string;
  title: string;
  severity: string;
  summary?: string | null;
  affectedProjectKeys?: string[];
  ownerTeamKey?: string | null;
  escalationPolicyKey?: string | null;
  /** The human who declared it, or null for an automated (check) declare. */
  declaredByUserId?: string | null;
  /** Intake dimension: how this incident was created. Defaults to manual. */
  source?: "manual" | "check";
  /** Back-link to the check that opened it (source === "check"). */
  sourceCheckId?: string | null;
};

export type DeclareResult =
  | { ok: true; incident: IncidentRow; responders: string[] }
  | { ok: false; error: "unknown_team" | "unknown_policy" | "unknown_service" | "number_conflict"; detail?: string };

/** A Postgres unique-violation (23505) on the incident number index — the signal to
 *  retry number allocation. Checks the error and its cause; the driver surfaces the
 *  SQLSTATE as `.code`. */
function isNumberConflict(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    (typeof e?.message === "string" && e.message.includes("incidents_org_number_key"))
  );
}

/**
 * Declare an incident. Runs the create in a tenant transaction (RLS), retries number
 * allocation on the unique-index race, then pages the first responders (deferred-style;
 * notifyIncident never throws). Returns the created incident + the responder user ids,
 * or a typed error the caller maps to an HTTP status. Never pages on a failed create.
 */
export async function declareIncident(input: DeclareInput): Promise<DeclareResult> {
  const declareOnce = () =>
    withOrg(input.orgId, async (tx) => {
      // Resolve affected services first (so owner can auto-derive from the first).
      const serviceRows: { id: string }[] = [];
      for (const key of input.affectedProjectKeys ?? []) {
        const p = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.key, key))
          .limit(1)
          .then((r) => r[0]);
        if (!p) return { ok: false as const, error: "unknown_service" as const, service: key };
        serviceRows.push(p);
      }
      let ownerTeamId: string | null = null;
      if (input.ownerTeamKey) {
        const team = await teamByKey(tx, input.ownerTeamKey);
        if (!team) return { ok: false as const, error: "unknown_team" as const };
        ownerTeamId = team.id;
      } else if (serviceRows.length > 0) {
        const [first] = await tx
          .select({ ownerTeamId: projects.ownerTeamId })
          .from(projects)
          .where(eq(projects.id, serviceRows[0].id))
          .limit(1);
        ownerTeamId = first?.ownerTeamId ?? null;
      }
      let escalationPolicyId: string | null = null;
      if (input.escalationPolicyKey) {
        const p = await policyByKey(tx, input.escalationPolicyKey);
        if (!p) return { ok: false as const, error: "unknown_policy" as const };
        escalationPolicyId = p.id;
      }

      const [{ max } = { max: 0 }] = await tx
        .select({ max: sql<number>`coalesce(max(${incidents.number}), 0)` })
        .from(incidents);
      const number = Number(max) + 1;

      const [incident] = await tx
        .insert(incidents)
        .values({
          organizationId: input.orgId,
          number,
          title: input.title,
          severity: input.severity,
          summary: input.summary ?? null,
          ownerTeamId,
          escalationPolicyId,
          declaredByUserId: input.declaredByUserId ?? null,
          source: input.source ?? "manual",
          sourceCheckId: input.sourceCheckId ?? null,
        })
        .returning();
      for (const s of serviceRows) {
        await tx.insert(incidentServices).values({ organizationId: input.orgId, incidentId: incident.id, projectId: s.id });
      }
      // Attach matching runbooks' steps as the incident checklist (by severity
      // threshold or affected-service coverage) — the playbook, ready on declare.
      await autoAttachRunbooks(tx, input.orgId, incident.id, incident.severity, serviceRows.map((s) => s.id));
      // Freeze the RCCA template onto this incident now, so a later template edit
      // never rewrites this incident's postmortem form.
      await tx
        .insert(incidentRccas)
        .values({ organizationId: input.orgId, incidentId: incident.id, template: await snapshotTemplate(tx, input.orgId) })
        .onConflictDoNothing();
      // Who to page first: the escalation policy's level 0 (step 0) when set, else the
      // owner team's on-call (falling back to the whole team). `escalated_level` stays
      // 0 so the cron climbs from step 1. If level 0 resolves to nobody (empty/deleted
      // target), fall back to the owner team so the first page is never black-holed.
      const now = new Date();
      let responders: string[];
      if (escalationPolicyId) {
        const { levels } = await loadPolicy(tx, escalationPolicyId);
        responders = levels.length ? await resolveLevelTargets(tx, levels[0], now) : [];
        if (responders.length === 0) responders = await teamResponders(tx, ownerTeamId, now);
      } else {
        responders = await teamResponders(tx, ownerTeamId, now);
      }
      return { ok: true as const, incident, responders };
    });

  // `number` is allocated as max()+1 under a unique (org, number) index. Two truly
  // concurrent declares in the same org can pick the same number; the loser hits the
  // unique violation — retry (re-reading max) a few times instead of failing during
  // the exact busy moment incidents get declared.
  let result: Awaited<ReturnType<typeof declareOnce>> | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      result = await declareOnce();
      break;
    } catch (err) {
      if (attempt < 3 && isNumberConflict(err)) continue;
      throw err;
    }
  }
  if (!result) return { ok: false, error: "number_conflict" };
  if (!result.ok) {
    if (result.error === "unknown_service") return { ok: false, error: "unknown_service", detail: result.service };
    return { ok: false, error: result.error };
  }

  // Page the responders (deferred-style; notifyIncident never throws).
  await notifyIncident({
    organizationId: input.orgId,
    userIds: result.responders,
    number: result.incident.number,
    title: result.incident.title,
    severity: result.incident.severity,
    status: result.incident.status,
    kind: "declared",
  });
  return { ok: true, incident: result.incident, responders: result.responders };
}
