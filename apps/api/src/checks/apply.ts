import { eq } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { checks, checkResults, type Check } from "../db/schema.js";
import { nextState, type Transition } from "./state.js";
import { handleTransition } from "./actions.js";
import type { ProbeResult } from "./probe.js";

const REGION = process.env.VERCEL_REGION ?? "default";

/**
 * Record one probe result and advance the check: insert a heartbeat row, update the
 * state machine (status + counters + timestamps), and — on a confirmed transition —
 * fire the action (notify channels, open/auto-resolve incident). Shared by the sweep
 * and the manual run-now so both behave identically. The action runs AFTER the record
 * tx commits (declareIncident opens its own transaction; it must not nest).
 */
export async function applyProbeResult(
  orgId: string,
  orgSlug: string,
  check: Check,
  result: ProbeResult,
): Promise<{ status: string; transition: Transition }> {
  const at = new Date();
  const st = nextState(check, result.ok);
  await withOrg(orgId, async (tx) => {
    await tx.insert(checkResults).values({
      organizationId: orgId,
      checkId: check.id,
      ok: result.ok,
      statusCode: result.statusCode ?? null,
      responseMs: result.responseMs ?? null,
      error: result.error ?? null,
      region: REGION,
    });
    await tx
      .update(checks)
      .set({
        status: st.status,
        consecutiveFailures: st.consecutiveFailures,
        consecutiveSuccesses: st.consecutiveSuccesses,
        lastCheckedAt: at,
        lastLatencyMs: result.responseMs ?? null,
        ...(st.transition ? { lastStatusChangedAt: at } : {}),
        updatedAt: at,
      })
      .where(eq(checks.id, check.id));
  });
  if (st.transition) await handleTransition(orgId, orgSlug, check, st.transition, result, at);
  return { status: st.status, transition: st.transition };
}
