import { and, eq, inArray, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { runbooks, runbookSteps, runbookServices, incidentChecklistItems } from "../db/schema.js";
import { getSeverityLevels, rankOf } from "./severity-levels.js";

type RunbookRow = typeof runbooks.$inferSelect;

/**
 * Runbooks that should attach to an incident of `severity` affecting `projectIds`:
 *   - severity trigger: the runbook's `triggerSeverity` is a live level and the
 *     incident is AT LEAST that severe (lower rank = more severe), OR
 *   - service coverage: the runbook covers one of the affected services.
 * Deduped by runbook id. `levels` is the org's configured severity ladder (rank source);
 * a trigger referencing an unknown/archived severity matches nothing.
 */
export async function matchingRunbooks(
  tx: TenantTx,
  levels: Array<{ key: string; rank: number }>,
  severity: string,
  projectIds: string[],
): Promise<RunbookRow[]> {
  const incidentRank = rankOf(levels, severity);
  const all = await tx.select().from(runbooks);
  const bySev = all.filter(
    (rb) =>
      rb.triggerSeverity &&
      levels.some((l) => l.key === rb.triggerSeverity) &&
      rankOf(levels, rb.triggerSeverity) >= incidentRank,
  );
  let byService: RunbookRow[] = [];
  if (projectIds.length > 0) {
    const svc = await tx
      .select({ runbookId: runbookServices.runbookId })
      .from(runbookServices)
      .where(inArray(runbookServices.projectId, projectIds));
    const ids = new Set(svc.map((r) => r.runbookId));
    byService = all.filter((rb) => ids.has(rb.id));
  }
  const map = new Map<string, RunbookRow>();
  for (const rb of [...bySev, ...byService]) map.set(rb.id, rb);
  return [...map.values()];
}

/**
 * Copy a runbook's steps onto an incident as checklist items. Idempotent per
 * runbook (a runbook already attached is skipped), and it COPIES — editing the
 * runbook later never mutates a live incident. Returns how many steps were added.
 */
export async function attachRunbook(
  tx: TenantTx,
  orgId: string,
  incidentId: string,
  rb: RunbookRow,
): Promise<number> {
  const existing = await tx
    .select({ id: incidentChecklistItems.id })
    .from(incidentChecklistItems)
    .where(and(eq(incidentChecklistItems.incidentId, incidentId), eq(incidentChecklistItems.runbookId, rb.id)))
    .limit(1)
    .then((r) => r[0]);
  if (existing) return 0;

  const steps = await tx.select().from(runbookSteps).where(eq(runbookSteps.runbookId, rb.id)).orderBy(runbookSteps.position);
  if (steps.length === 0) return 0;
  const [{ max } = { max: -1 }] = await tx
    .select({ max: sql<number>`coalesce(max(${incidentChecklistItems.position}), -1)` })
    .from(incidentChecklistItems)
    .where(eq(incidentChecklistItems.incidentId, incidentId));
  let position = Number(max) + 1;
  for (const s of steps) {
    await tx.insert(incidentChecklistItems).values({
      organizationId: orgId,
      incidentId,
      runbookId: rb.id,
      runbookName: rb.name,
      position: position++,
      title: s.title,
      body: s.body,
      kind: s.kind,
      url: s.url,
    });
  }
  return steps.length;
}

/** Attach every runbook that matches this incident (used on declare). */
export async function autoAttachRunbooks(
  tx: TenantTx,
  orgId: string,
  incidentId: string,
  severity: string,
  projectIds: string[],
): Promise<void> {
  const levels = await getSeverityLevels(tx, orgId);
  const rbs = await matchingRunbooks(tx, levels, severity, projectIds);
  for (const rb of rbs) await attachRunbook(tx, orgId, incidentId, rb);
}
