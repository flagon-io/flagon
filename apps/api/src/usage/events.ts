import { sql } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { usageEventRollups } from "../db/schema.js";

/**
 * Billable events: recorded when a customer sends analytics/telemetry to Flagon,
 * read back by the console usage page and (later) billed.
 *
 * This is the money meter (`events`). Flag CHECKS are free and counted
 * separately (flags/usage.ts -> flag_eval_rollups); an EVENT is something the
 * customer chooses to send us for analytics — a flag exposure today, other
 * products' events later. We only store per-(org, day, source) counts here; the
 * per-flag/experiment detail, if any, is the analytics product's concern.
 *
 * `source` is namespaced by producing product ("flags.exposure" today, e.g.
 * "deployments.run" later) so the one Events meter breaks down per product.
 *
 * Best-effort, exactly like evaluation recording: callers fire this off the hot
 * path (waitUntil) and it must never throw back into an ingest response —
 * analytics can be lossy, and a customer's telemetry POST must not 500 because a
 * rollup write hiccuped.
 */

/** UTC day bucket for a timestamp (ms), defaulting to now. */
function dayOf(atMs?: number): string {
  return new Date(atMs ?? Date.now()).toISOString().slice(0, 10);
}

/**
 * Fold a batch of events into the daily rollups (one upsert per (day, source)).
 * `count` is the number of events; `source` names what produced them. Duplicates
 * within the batch collapse into the increment, so a client sending 500 exposures
 * costs one row's `count + 500`.
 */
export async function recordEvents(
  organizationId: string,
  count: number,
  opts: { source?: string; atMs?: number } = {},
): Promise<void> {
  if (count <= 0) return;
  const day = dayOf(opts.atMs);
  const source = opts.source ?? "flags.exposure";

  try {
    await withOrg(organizationId, async (tx) => {
      await tx
        .insert(usageEventRollups)
        .values({ organizationId, day, source, count })
        .onConflictDoUpdate({
          target: [
            usageEventRollups.organizationId,
            usageEventRollups.day,
            usageEventRollups.source,
          ],
          set: {
            count: sql`${usageEventRollups.count} + excluded.count`,
            updatedAt: sql`now()`,
          },
        });
    });
  } catch (err) {
    // Swallow: a rollup write must never surface as an ingest failure.
    console.error("[usage] recordEvents failed", err);
  }
}
