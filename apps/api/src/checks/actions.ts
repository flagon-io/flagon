import { eq } from "drizzle-orm";
import { withOrg, type TenantTx } from "../db/tenant.js";
import {
  checks,
  incidents,
  incidentUpdates,
  projects,
  runbooks,
  type Check,
  type CheckIncidentAction,
  type DeliveryPayload,
} from "../db/schema.js";
import { enqueueNotifications } from "../notifications/dispatch.js";
import { declareIncident } from "../incidents/declare.js";
import { attachRunbook } from "../incidents/runbook-attach.js";
import { env } from "../env.js";
import { captureError } from "../lib/monitoring.js";
import type { ProbeResult } from "./probe.js";
import type { Transition } from "./state.js";

/**
 * What a check DOES on a confirmed transition — ONE response mode (detection and
 * response are separate layers):
 *   - track: nothing.
 *   - notify: post the state change to the check's channels (destinations).
 *   - incident: on down, declare an incident (pages the owning team's on-call or the
 *     policy through each responder's notification channels; posts opened/resolved to
 *     the check's channels; attaches a runbook); on up, auto-resolve it. All time-based
 *     escalation lives in the incident's escalation policy, not here.
 * Deduped by checks.active_incident_id so a flapping check never opens a pile. Runs
 * OUTSIDE the record tx (declareIncident opens its own).
 */
export async function handleTransition(
  orgId: string,
  orgSlug: string,
  check: Check,
  transition: Transition,
  probe: ProbeResult,
  at: Date,
): Promise<void> {
  if (!transition) return;
  const action = check.action ?? {};
  const mode = action.mode ?? (action.incident ? "incident" : action.channelKeys?.length ? "notify" : "track");
  if (mode === "track") return;
  const down = transition === "to_down";
  const channelKeys = (action.channelKeys ?? []).filter(Boolean);

  if (mode === "notify") {
    if (channelKeys.length === 0) return;
    try {
      await withOrg(orgId, async (tx) => {
        const projectKey = await projectKeyFor(tx, check.projectId);
        await enqueueNotifications(tx, {
          orgId,
          channelKeys,
          sourceType: "check",
          sourceId: check.id,
          // Stamped with the transition time: stable within a transition, distinct across
          // transitions (a new alert per real event).
          eventKey: `check.${down ? "down" : "up"}:${check.id}:${at.getTime()}`,
          payload: buildCheckPayload(orgSlug, projectKey, check, transition, probe),
        });
      });
    } catch (err) {
      captureError("[checks] notify enqueue failed", err, { org: orgId, check: check.id });
    }
    return;
  }

  // mode === "incident"
  if (down) {
    try {
      await openIncidentForCheck(orgId, orgSlug, check, action.incident ?? { severity: "sev3" }, channelKeys);
    } catch (err) {
      captureError("[checks] open incident failed", err, { org: orgId, check: check.id });
    }
  } else if (check.activeIncidentId && action.incident?.autoResolve !== false) {
    try {
      await resolveIncidentForCheck(orgId, orgSlug, check, channelKeys);
    } catch (err) {
      captureError("[checks] auto-resolve incident failed", err, { org: orgId, check: check.id });
    }
  }
}

async function projectKeyFor(tx: TenantTx, projectId: string): Promise<string | null> {
  const [p] = await tx.select({ key: projects.key }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return p?.key ?? null;
}

function buildCheckPayload(orgSlug: string, projectKey: string | null, check: Check, transition: Transition, probe: ProbeResult): DeliveryPayload {
  const down = transition === "to_down";
  const appUrl = env.APP_URL ?? "http://localhost:3001";
  const link = projectKey ? `${appUrl}/${orgSlug}/projects/${projectKey}/checks/${check.key}` : `${appUrl}/${orgSlug}/checks`;
  return {
    title: `${down ? "Check down" : "Check recovered"}: ${check.name}`,
    body: down ? (probe.error ? `Failing: ${probe.error}` : "The check is failing.") : "The check is passing again.",
    severity: down ? "down" : "up",
    kind: down ? "check.down" : "check.up",
    fields: [
      ...(probe.statusCode != null ? [{ label: "Status", value: String(probe.statusCode) }] : []),
      ...(probe.responseMs != null ? [{ label: "Latency", value: `${probe.responseMs}ms` }] : []),
    ],
    url: link,
  };
}

function buildIncidentPayload(orgSlug: string, check: Check, number: number, severity: string, opened: boolean): DeliveryPayload {
  const appUrl = env.APP_URL ?? "http://localhost:3001";
  return {
    title: opened ? `Incident declared: ${check.name}` : `Incident resolved: ${check.name}`,
    body: opened ? `Check "${check.name}" is down. On-call has been paged.` : `Check "${check.name}" recovered; the incident auto-resolved.`,
    severity: opened ? severity : "up",
    kind: opened ? "incident.declared" : "incident.resolved",
    fields: [{ label: "Incident", value: `INC-${number}` }],
    url: `${appUrl}/${orgSlug}/incidents/${number}`,
  };
}

/** Open an incident for a down check (deduped by active_incident_id), attach the chosen
 *  runbook, and post an "incident declared" notice to the check's channels. */
async function openIncidentForCheck(orgId: string, orgSlug: string, check: Check, inc: CheckIncidentAction, channelKeys: string[]): Promise<void> {
  // Dedupe: if we still hold an open incident for this check, do nothing.
  if (check.activeIncidentId) {
    const existing = await withOrg(orgId, (tx) =>
      tx.select({ status: incidents.status }).from(incidents).where(eq(incidents.id, check.activeIncidentId!)).limit(1).then((r) => r[0]),
    );
    if (existing && existing.status !== "resolved") return;
  }
  const projectKey = await withOrg(orgId, (tx) => projectKeyFor(tx, check.projectId));
  const result = await declareIncident({
    orgId,
    title: `${check.name} is down`,
    severity: inc.severity,
    summary: `Opened automatically by check "${check.name}".`,
    affectedProjectKeys: projectKey ? [projectKey] : [],
    ownerTeamKey: inc.ownerTeamKey ?? undefined,
    escalationPolicyKey: inc.escalationPolicyKey ?? undefined,
    declaredByUserId: null,
    source: "check",
    sourceCheckId: check.id,
  });
  if (!result.ok) return;
  await withOrg(orgId, async (tx) => {
    await tx.update(checks).set({ activeIncidentId: result.incident.id, updatedAt: new Date() }).where(eq(checks.id, check.id));
    // declareIncident auto-attaches runbooks matching by severity/service; attachRunbook
    // is idempotent, so this just forces the specific one the check picked.
    if (inc.runbookKey) {
      const rb = await tx.select().from(runbooks).where(eq(runbooks.key, inc.runbookKey)).limit(1).then((r) => r[0]);
      if (rb) await attachRunbook(tx, orgId, result.incident.id, rb);
    }
    if (channelKeys.length > 0) {
      await enqueueNotifications(tx, {
        orgId,
        channelKeys,
        sourceType: "incident",
        sourceId: result.incident.id,
        eventKey: `incident.opened:${result.incident.id}`,
        payload: buildIncidentPayload(orgSlug, check, result.incident.number, inc.severity, true),
      });
    }
  });
}

/** Auto-resolve the incident a check opened, and post a recovery notice to its channels. */
async function resolveIncidentForCheck(orgId: string, orgSlug: string, check: Check, channelKeys: string[]): Promise<void> {
  const incidentId = check.activeIncidentId;
  if (!incidentId) return;
  await withOrg(orgId, async (tx) => {
    const [inc] = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (inc && inc.status !== "resolved") {
      const at = new Date();
      await tx.update(incidents).set({ status: "resolved", resolvedAt: at, updatedAt: at }).where(eq(incidents.id, incidentId));
      await tx.insert(incidentUpdates).values({
        organizationId: orgId,
        incidentId,
        body: `Auto-resolved: check "${check.name}" recovered.`,
        status: "resolved",
        createdByUserId: null,
      });
      if (channelKeys.length > 0) {
        await enqueueNotifications(tx, {
          orgId,
          channelKeys,
          sourceType: "incident",
          sourceId: incidentId,
          eventKey: `incident.resolved:${incidentId}`,
          payload: buildIncidentPayload(orgSlug, check, inc.number, inc.severity, false),
        });
      }
    }
    // Clear the link whether or not it was already resolved by a human.
    await tx.update(checks).set({ activeIncidentId: null, updatedAt: new Date() }).where(eq(checks.id, check.id));
  });
}
