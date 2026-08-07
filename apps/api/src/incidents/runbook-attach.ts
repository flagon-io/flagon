import { and, eq, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { runbooks, runbookSteps, incidentChecklistItems, type AttachCondition } from "../db/schema.js";
import { evaluateChecklist } from "./checklist-eval.js";

type RunbookRow = typeof runbooks.$inferSelect;

/**
 * Whether a runbook's attach conditions hold for an incident of `severity`. ALL
 * conditions must match, so EMPTY conditions match every incident (the "Default").
 */
export function attachMatches(conditions: AttachCondition[], severity: string): boolean {
  return conditions.every((c) => c.type === "severity" && c.values.includes(severity));
}

/**
 * The runbooks that should auto-attach to an incident of `severity`: every runbook
 * that isn't manual-only and whose conditions match (empty = all). Re-checked as the
 * incident evolves, so a severity-scoped runbook attaches the moment it applies.
 */
export async function matchingRunbooks(tx: TenantTx, severity: string): Promise<RunbookRow[]> {
  const all = await tx.select().from(runbooks);
  return all.filter((rb) => !rb.manualOnly && attachMatches(rb.attachConditions, severity));
}

/**
 * Copy a runbook's steps onto an incident as checklist items. Idempotent per runbook
 * (an already-attached runbook is skipped), and it COPIES — editing the runbook later
 * never mutates a live incident. Returns how many steps were added.
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
      // Carry the step's execution model onto the incident's own copy. Everything
      // starts `pending`; evaluateChecklist activates whatever is already eligible.
      provider: s.provider,
      action: s.action,
      conditions: s.conditions,
      state: "pending",
    });
  }
  return steps.length;
}

/**
 * Attach every runbook that currently matches the incident, then evaluate the
 * checklist so eligible steps fire. Shared by declare (`status` = open) and by the
 * on-progress re-evaluation when severity or milestone changes — a runbook only ever
 * attaches once (attachRunbook is idempotent), so calling this repeatedly is safe.
 */
export async function attachMatchingRunbooks(
  tx: TenantTx,
  orgId: string,
  incidentId: string,
  severity: string,
  status: string,
): Promise<void> {
  const rbs = await matchingRunbooks(tx, severity);
  for (const rb of rbs) await attachRunbook(tx, orgId, incidentId, rb);
  await evaluateChecklist(tx, orgId, { incidentId, severity, status });
}

/** The starter steps a freshly-seeded Default runbook ships with. */
const DEFAULT_STEPS: Array<{ title: string; action: string }> = [
  { title: "Assign an incident commander", action: "assign-role" },
  { title: "Open a comms channel", action: "task" },
  { title: "Update the status page", action: "status-page" },
  { title: "Start the retrospective", action: "start-retro" },
];

/**
 * Ensure the org has at least a "Default" runbook — an always-attach playbook (no
 * conditions) with a few starter steps. Seeded lazily when the org has none, so every
 * org has a sensible default that lands on every incident. Idempotent; if the org
 * deleted all runbooks it's re-seeded (there is always a default to fall back on).
 */
export async function ensureDefaultRunbook(tx: TenantTx, orgId: string): Promise<void> {
  const any = await tx.select({ id: runbooks.id }).from(runbooks).limit(1).then((r) => r[0]);
  if (any) return;
  const [rb] = await tx
    .insert(runbooks)
    .values({ organizationId: orgId, key: "default", name: "Default", description: "Runs on every incident.", manualOnly: false, attachConditions: [] })
    .returning();
  let position = 0;
  for (const s of DEFAULT_STEPS) {
    await tx.insert(runbookSteps).values({
      organizationId: orgId,
      runbookId: rb.id,
      position: position++,
      title: s.title,
      kind: "task",
      provider: "core",
      action: s.action,
      // The retro step waits for resolution; the rest run on attach.
      conditions: s.action === "start-retro" ? [{ type: "milestone", values: ["resolved"] }] : [],
    });
  }
}
