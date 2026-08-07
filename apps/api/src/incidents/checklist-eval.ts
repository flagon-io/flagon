import { and, eq, isNull } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import {
  incidentChecklistItems,
  incidentRccas,
  orgIntegrations,
  type StepCondition,
} from "../db/schema.js";

/**
 * The runbook checklist EXECUTION engine (FireHydrant-style).
 *
 * A materialized step starts life `pending` and becomes eligible only when ALL of
 * its conditions hold against the live incident. When it does:
 *   - a native step (provider "core") activates — it becomes a live to-do; and a
 *     "start-retro" step marks the retrospective underway.
 *   - an integration step activates only if its provider is actually CONNECTED;
 *     otherwise it's `skipped` with a reason (the real integration check, not a stub).
 *
 * Idempotent: it only ever moves `pending` steps forward, so it's safe to run on
 * attach, on every status change, and after a step is checked off (which can satisfy
 * a `previous_step` condition downstream).
 */

type IncidentState = { severity: string; status: string };
type EvalContext = IncidentState & { incidentId: string };

function conditionMet(cond: StepCondition, s: IncidentState, prevSettled: boolean): boolean {
  switch (cond.type) {
    case "severity":
      return cond.values.includes(s.severity);
    case "milestone":
      return cond.values.includes(s.status);
    case "previous_step":
      return prevSettled;
  }
}

/** All conditions hold. Empty conditions ⇒ eligible immediately (runs on attach). */
export function stepEligible(
  conditions: StepCondition[],
  state: IncidentState,
  prevSettled: boolean,
): boolean {
  return conditions.every((c) => conditionMet(c, state, prevSettled));
}

/** Mark the incident's retrospective as started (idempotent; never un-starts). */
export async function startRetro(tx: TenantTx, incidentId: string): Promise<void> {
  await tx
    .update(incidentRccas)
    .set({ startedAt: new Date() })
    .where(and(eq(incidentRccas.incidentId, incidentId), isNull(incidentRccas.startedAt)));
}

/** The provider keys the org has connected — same rule as store.serializeIntegration. */
async function connectedProviders(tx: TenantTx, orgId: string): Promise<Set<string>> {
  const rows = await tx
    .select({
      provider: orgIntegrations.provider,
      status: orgIntegrations.status,
      secretCiphertext: orgIntegrations.secretCiphertext,
    })
    .from(orgIntegrations)
    .where(eq(orgIntegrations.organizationId, orgId));
  return new Set(
    rows.filter((r) => Boolean(r.secretCiphertext) && r.status !== "disabled").map((r) => r.provider),
  );
}

/**
 * Advance an incident's checklist against its current state. Walks steps in order so
 * a `previous_step` condition sees the step above it; "settled" means that step is
 * done or was skipped (it has run its course), so a dependent step isn't stranded.
 */
export async function evaluateChecklist(tx: TenantTx, orgId: string, ctx: EvalContext): Promise<void> {
  const items = await tx
    .select({
      id: incidentChecklistItems.id,
      provider: incidentChecklistItems.provider,
      action: incidentChecklistItems.action,
      conditions: incidentChecklistItems.conditions,
      state: incidentChecklistItems.state,
      done: incidentChecklistItems.done,
    })
    .from(incidentChecklistItems)
    .where(eq(incidentChecklistItems.incidentId, ctx.incidentId))
    .orderBy(incidentChecklistItems.position);
  if (items.length === 0) return;

  // Only fetched (once) if an integration step actually becomes eligible.
  let connected: Set<string> | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.state !== "pending") continue;
    const prev = items[i - 1];
    const prevSettled = i === 0 ? true : prev.state === "skipped" || prev.done;
    if (!stepEligible(item.conditions ?? [], ctx, prevSettled)) continue;

    if (item.provider !== "core") {
      if (!connected) connected = await connectedProviders(tx, orgId);
      if (!connected.has(item.provider)) {
        await tx
          .update(incidentChecklistItems)
          .set({ state: "skipped", skippedReason: `The ${item.provider} integration isn't connected.` })
          .where(eq(incidentChecklistItems.id, item.id));
        items[i] = { ...item, state: "skipped" };
        continue;
      }
    }

    await tx
      .update(incidentChecklistItems)
      .set({ state: "active" })
      .where(eq(incidentChecklistItems.id, item.id));
    items[i] = { ...item, state: "active" };
    if (item.action === "start-retro") await startRetro(tx, ctx.incidentId);
  }
}

/**
 * Run the side effects of an incident reaching a new status: entering the
 * retrospective milestone starts the retro, then the checklist is re-evaluated so
 * any step gated on the new state fires. Call after every status write.
 */
export async function afterStatusChange(
  tx: TenantTx,
  orgId: string,
  ctx: EvalContext,
): Promise<void> {
  if (ctx.status === "retrospective") await startRetro(tx, ctx.incidentId);
  await evaluateChecklist(tx, orgId, ctx);
}
