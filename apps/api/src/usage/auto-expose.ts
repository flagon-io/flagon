import { env } from "../env.js";
import { withOrg } from "../db/tenant.js";
import { hashUnit } from "../lib/unit-hash.js";
import { anyPlanHardCaps, planHardCaps } from "../lib/plans.js";
import { compactUsageEvents, ingestEvents } from "./events.js";
import { eventsAllowanceStatus, isIngestCapped } from "./allowance.js";
import { notifyUsageThresholds } from "./notify.js";
import { attributeExposures } from "../experiments/ingest.js";
import { createSessionDedup } from "./session-dedup.js";
import type { ClientKeyIdentity } from "../flags/client-key.js";
import type { EvaluationContext, EvaluationResult, FlagConfig } from "../flags/types.js";

/**
 * Exposures default-on: a remote (per-flag) evaluation that carries a targetingKey
 * auto-logs ONE billable exposure, deduped per (env, flag, unit, variant) within a
 * session window so a hot page bills once per session, not per request. This is the
 * switch that makes plain feature management earn (Statsig's model); an evaluation
 * still resolves for free, the exposure is the metered event.
 *
 * It bills through the SAME durable meter as the explicit `/ofrep/v1/exposures`
 * endpoint (`source: "flags.exposure"`), so auto and explicit share one usage line.
 * It runs DEFERRED off the eval hot path and swallows every error: auto-exposure
 * must never add latency to, or fail, an evaluation.
 *
 * This module is a BILLING concern and depends on the flags primitive (types) and
 * the experiments attribution ingest, never the reverse, so the decoupled `flags/`
 * core stays clean.
 */

// Process-local session-dedup (createSessionDedup is pure; see session-dedup.ts).
const dedup = createSessionDedup(env.EXPOSURE_DEDUP_TTL_MS);

// --- Plan-cap gate, cached per org (~60s) so the deduped exposures don't each hit
// the DB. Uses the plan the client key already resolved. A capped Hobby org keeps
// getting flags SERVED; it just stops accruing billable exposures. --------------
const capState = new Map<string, { capped: boolean; expiresAt: number }>();
const CAP_TTL_MS = 60_000;

async function orgIsCapped(orgId: string, plan: string, nowMs: number): Promise<boolean> {
  // Static short-circuit: if no plan hard-caps (or this plan doesn't), never capped.
  if (!anyPlanHardCaps() || !planHardCaps(plan)) return false;
  const hit = capState.get(orgId);
  if (hit && hit.expiresAt > nowMs) return hit.capped;
  const status = await withOrg(orgId, (tx) => eventsAllowanceStatus(tx, plan));
  const capped = isIngestCapped(status);
  capState.set(orgId, { capped, expiresAt: nowMs + CAP_TTL_MS });
  return capped;
}

// --- Compaction/notify time-gate. Stripe reporting (report-sweep.ts) only sends
// COMPACTED receipts, and compaction is inline (never in the cron). So auto-exposed
// events must be compacted or they never reach Stripe. Compaction folds ALL of an
// org's uncompacted events at once, so we gate it to at most once per org per
// interval (well inside the 5-minute reporting cron) instead of per exposure. -----
const nextFlushMs = new Map<string, number>();
const FLUSH_INTERVAL_MS = 30_000;

async function flushBilling(orgId: string, nowMs: number): Promise<void> {
  if (nowMs < (nextFlushMs.get(orgId) ?? 0)) return;
  nextFlushMs.set(orgId, nowMs + FLUSH_INTERVAL_MS);
  await Promise.all([
    compactUsageEvents(orgId),
    notifyUsageThresholds(orgId),
  ]).catch(() => {});
}

/**
 * Record an auto-exposure for one evaluated flag, if it qualifies. Call DEFERRED
 * from the single-flag evaluate handler. `optedOut` is the per-request override
 * (the `X-Flagon-Exposure: off` header), resolved at the call site.
 */
export async function maybeAutoExpose(
  identity: ClientKeyIdentity,
  flag: FlagConfig,
  result: EvaluationResult,
  context: EvaluationContext,
  optedOut: boolean,
): Promise<void> {
  try {
    if (!env.EXPOSURE_AUTO_ENABLED || !identity.autoExpose || optedOut) return;

    // No unit → can't attribute or dedup, and anonymous health-checks shouldn't
    // bill. An ERROR result never resolved to a value the unit saw.
    const unit = context.targetingKey;
    if (typeof unit !== "string" || unit.length === 0) return;
    if (result.reason === "ERROR") return;

    const variant = result.variant ?? "";
    const nowMs = Date.now();
    const key = `${identity.environmentId}:${flag.key}:${hashUnit(unit)}:${variant}`;
    if (!dedup.markSeen(key, nowMs)) return; // already billed this session

    if (await orgIsCapped(identity.organizationId, identity.plan, nowMs)) return;

    await ingestEvents(identity.organizationId, 1, { source: "flags.exposure" });
    await attributeExposures(identity.organizationId, identity.environmentId, [
      { key: flag.key, variant, targetingKey: unit },
    ]);
    await flushBilling(identity.organizationId, nowMs);
  } catch {
    // Best-effort: auto-exposure must never affect the evaluation response.
  }
}

/** Test hook: clear the process-local caches between cases. */
export function __resetAutoExposeState(): void {
  capState.clear();
  nextFlushMs.clear();
  dedup.clear();
}
