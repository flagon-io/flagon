import { and, eq, isNull, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import {
  incidents,
  incidentRccas,
  incidentServices,
  incidentUpdates,
  projects,
} from "../db/schema.js";
import { getSeverityLevels, defaultKey } from "./severity-levels.js";
import { ensureDefaultRunbook, attachMatchingRunbooks } from "./runbook-attach.js";
import { ensureRccaTemplate } from "./rcca-template.js";

/**
 * Incident lifecycle primitives shared by the incidents route and Checks' incident
 * automation. A failing monitor OPENS an incident on its linked service; a recovery
 * RESOLVES it. Both run inside a caller-provided tenant transaction so the check-state
 * update and the incident write commit together. Kept deliberately small: allocate a
 * number, insert the incident, link the service, seed the timeline + playbook + RCCA
 * snapshot (so an auto-opened incident is a first-class one), and stamp resolution off
 * `resolvedAt` (not status), matching the rest of the product.
 */

/** True when the error looks like the (org, number) unique violation — a retry signal. */
export function isIncidentNumberConflict(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("incidents_org_number_key") || msg.includes("duplicate key");
}

/**
 * Open an incident on a linked project (service). Allocates number = max()+1 under the
 * unique (org, number) index — the caller retries on {@link isIncidentNumberConflict}.
 * Returns the new incident id, or null if the org has no severity ladder configured.
 */
export async function openIncidentForCheck(
  tx: TenantTx,
  orgId: string,
  input: { title: string; summary: string | null; projectId: string; declaredByUserId: string | null },
): Promise<{ id: string; number: number } | null> {
  const levels = await getSeverityLevels(tx, orgId);
  const severity = defaultKey(levels);
  if (!severity) return null;

  // Derive the owning team from the linked project, mirroring a manual declare.
  const [project] = await tx
    .select({ ownerTeamId: projects.ownerTeamId })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  const ownerTeamId = project?.ownerTeamId ?? null;

  const [{ max } = { max: 0 }] = await tx
    .select({ max: sql<number>`coalesce(max(${incidents.number}), 0)` })
    .from(incidents);
  const number = Number(max) + 1;

  const [incident] = await tx
    .insert(incidents)
    .values({
      organizationId: orgId,
      number,
      title: input.title,
      severity,
      summary: input.summary,
      ownerTeamId,
      declaredByUserId: input.declaredByUserId,
    })
    .returning();

  await tx
    .insert(incidentServices)
    .values({ organizationId: orgId, incidentId: incident!.id, projectId: input.projectId });

  await tx.insert(incidentUpdates).values({
    organizationId: orgId,
    incidentId: incident!.id,
    body: "Opened automatically by a failing check.",
    status: "open",
    createdByUserId: input.declaredByUserId,
  });

  await ensureDefaultRunbook(tx, orgId);
  await attachMatchingRunbooks(tx, orgId, incident!.id, incident!.severity, incident!.status);

  const template = await ensureRccaTemplate(tx, orgId);
  await tx
    .insert(incidentRccas)
    .values({
      organizationId: orgId,
      incidentId: incident!.id,
      template: { requiredSeverities: template.requiredSeverities, fields: template.fields },
    })
    .onConflictDoNothing();

  return { id: incident!.id, number };
}

/**
 * Resolve an auto-opened incident on recovery — only if it is still open (resolvedAt
 * null), so a manually-resolved incident is never re-stamped. Adds a closing update.
 * Idempotent: a no-op if already resolved or gone.
 */
export async function resolveIncidentForCheck(
  tx: TenantTx,
  orgId: string,
  incidentId: string,
): Promise<void> {
  const now = new Date();
  const updated = await tx
    .update(incidents)
    .set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(and(eq(incidents.id, incidentId), isNull(incidents.resolvedAt)))
    .returning({ id: incidents.id });
  if (updated.length === 0) return;

  await tx.insert(incidentUpdates).values({
    organizationId: orgId,
    incidentId,
    body: "Resolved automatically after the check recovered.",
    status: "resolved",
  });
}
