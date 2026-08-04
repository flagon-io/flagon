import { and, eq, inArray, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { runbooks, runbookSteps, runbookServices, incidentChecklistItems } from "../db/schema.js";

type RunbookRow = typeof runbooks.$inferSelect;

const SEV_RANK: Record<string, number> = { sev1: 1, sev2: 2, sev3: 3, sev4: 4 };

/**
 * Runbooks that should attach to an incident of `severity` affecting `projectIds`:
 *   - severity trigger: the runbook's `triggerSeverity` is set and the incident is
 *     AT LEAST that severe (sev1 highest), OR
 *   - service coverage: the runbook covers one of the affected services.
 * Deduped by runbook id.
 */
export async function matchingRunbooks(
  tx: TenantTx,
  severity: string,
  projectIds: string[],
): Promise<RunbookRow[]> {
  const incidentRank = SEV_RANK[severity] ?? 99;
  const all = await tx.select().from(runbooks);
  const bySev = all.filter(
    (rb) => rb.triggerSeverity && (SEV_RANK[rb.triggerSeverity] ?? 0) >= incidentRank,
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
  const rbs = await matchingRunbooks(tx, severity, projectIds);
  for (const rb of rbs) await attachRunbook(tx, orgId, incidentId, rb);
}
