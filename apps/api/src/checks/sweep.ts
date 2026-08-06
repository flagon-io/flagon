import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { checks, type Check } from "../db/schema.js";
import { env } from "../env.js";
import { captureError } from "../lib/monitoring.js";
import { logger } from "../lib/logger.js";
import { probe } from "./probe.js";
import { applyProbeResult } from "./apply.js";

/**
 * The checks sweep — one cron, many checks. Runs every due check (now >= next_run_at)
 * across all orgs, probes it, records the result, advances the state machine, and fires
 * the action on a confirmed transition. Mirrors the escalation/notify sweeps:
 *
 * - CLAIM by atomically advancing next_run_at before probing, so two overlapping sweeps
 *   never double-probe the same check.
 * - PROBE with bounded concurrency and NO transaction held (probes are slow I/O).
 * - RECORD + transition in a short per-check tx; actions run AFTER it (declareIncident
 *   opens its own tx, so it must not nest).
 * - BUDGET: at most CHECKS_MAX_PER_SWEEP per run; the rest keep their due next_run_at
 *   and are picked next minute. Deferrals are logged, never silently dropped.
 * Per-org isolation via the withOrg loop; a failed org is captured and skipped.
 */

/** Bounded-concurrency map: run `fn` over items, at most `limit` at once. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function sweepChecks(): Promise<{ orgs: number; probed: number; transitions: number; deferred: number }> {
  const orgs = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  const now = new Date();
  const budget = env.CHECKS_MAX_PER_SWEEP;

  // 1) Claim due checks across orgs, up to the budget.
  const claimed: { orgId: string; orgSlug: string; check: Check }[] = [];
  let deferred = 0;
  for (const org of orgs) {
    const remaining = budget - claimed.length;
    try {
      const taken = await withOrg(org.id, async (tx) => {
        const due = await tx
          .select()
          .from(checks)
          .where(and(eq(checks.enabled, true), eq(checks.paused, false), lte(checks.nextRunAt, now)))
          .orderBy(checks.nextRunAt)
          .limit(Math.max(remaining, 0) + 1); // +1 so we can detect an over-budget org
        const out: Check[] = [];
        for (const chk of due) {
          if (out.length >= remaining) {
            deferred += 1;
            continue;
          }
          // Atomic claim: advance next_run_at; a concurrent sweep that already advanced
          // it makes this match no row, so it won't be double-probed.
          const [c] = await tx
            .update(checks)
            .set({ nextRunAt: new Date(now.getTime() + chk.intervalSeconds * 1000) })
            .where(and(eq(checks.id, chk.id), lte(checks.nextRunAt, now)))
            .returning();
          if (c) out.push(c);
        }
        return out;
      });
      for (const chk of taken) claimed.push({ orgId: org.id, orgSlug: org.slug, check: chk });
    } catch (err) {
      captureError("[checks] claim failed", err, { org: org.id });
    }
  }
  if (deferred > 0) {
    logger.info("[checks] sweep hit the per-run budget; deferring to next run", { budget, deferred });
  }

  // 2) Probe with bounded concurrency (no tx held).
  const probed = await mapPool(claimed, env.CHECKS_MAX_CONCURRENCY, async (item) => ({ item, result: await probe(item.check) }));

  // 3) Record + fire transitions (shared with the manual run-now path).
  let transitions = 0;
  for (const { item, result } of probed) {
    try {
      const { transition } = await applyProbeResult(item.orgId, item.orgSlug, item.check, result);
      if (transition) transitions += 1;
    } catch (err) {
      captureError("[checks] record/transition failed", err, { org: item.orgId, check: item.check.id });
    }
  }

  return { orgs: orgs.length, probed: probed.length, transitions, deferred };
}
