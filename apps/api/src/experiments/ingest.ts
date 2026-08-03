import { and, eq, inArray } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { hashUnit } from "../lib/unit-hash.js";
import { flagExposures, flags, experimentMetricEvents } from "../db/schema.js";

/**
 * Experiment attribution + goal-event persistence — the ANALYSIS substrate that
 * rides alongside billing.
 *
 * Billing stays exact and in-band (usage_events via ingestEvents); everything
 * here is best-effort analytics that runs OFF the hot path (deferred like the
 * eval-usage rollups): if an attribution write slips, the customer is still
 * billed correctly and the next batch re-attributes. Unit identities are stored
 * only as a salted hash (lib/unit-hash.ts) — never the raw targeting key.
 */

/** A single exposure event as the SDK sends it (extra fields ignored). */
export type ExposureEvent = {
  /** The flag key the exposure is for. */
  key?: unknown;
  /** The variant the SDK actually served (the arm to attribute). */
  variant?: unknown;
  /** The unit identity — the evaluation targetingKey. */
  targetingKey?: unknown;
};

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/** UTC day (YYYY-MM-DD). */
function dayOf(atMs?: number): string {
  return new Date(atMs ?? Date.now()).toISOString().slice(0, 10);
}

/**
 * Attribute exposures to their flag, ALWAYS-ON — no experiment required. For each
 * event that names a flag AND carries the served variant + a targeting key, record
 * the unit's assignment to (flag, environment, variant), frozen on first exposure
 * (ON CONFLICT DO NOTHING on (flag, env, unit), so a unit never flips arms). This
 * powers flag-level impact for any flag and, retroactively, any experiment created
 * later on that flag. Events missing variant/targetingKey, or naming an unknown
 * flag, are skipped — metering already happened, this is additive.
 */
export async function attributeExposures(
  organizationId: string,
  environmentId: string,
  events: ExposureEvent[],
  atMs?: number,
): Promise<{ attributed: number }> {
  // Collect the distinct flag keys present in the batch that also carry a unit.
  const usable = events
    .map((e) => ({
      flagKey: asString(e.key),
      variant: asString(e.variant),
      targetingKey: asString(e.targetingKey),
    }))
    .filter(
      (e): e is { flagKey: string; variant: string; targetingKey: string } =>
        e.flagKey !== null && e.variant !== null && e.targetingKey !== null,
    );
  if (usable.length === 0) return { attributed: 0 };

  const flagKeys = [...new Set(usable.map((e) => e.flagKey))];
  const day = dayOf(atMs);

  return withOrg(organizationId, async (tx) => {
    // Resolve the batch's flag keys to ids once (org-scoped by RLS).
    const flagRows = await tx
      .select({ id: flags.id, key: flags.key })
      .from(flags)
      .where(inArray(flags.key, flagKeys));
    if (flagRows.length === 0) return { attributed: 0 };
    const idByKey = new Map<string, string>();
    for (const f of flagRows) idByKey.set(f.key, f.id);

    const rows = usable
      .map((e) => {
        const flagId = idByKey.get(e.flagKey);
        if (!flagId) return null;
        return {
          organizationId,
          flagId,
          environmentId,
          variantKey: e.variant,
          unitHash: hashUnit(e.targetingKey),
          day,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return { attributed: 0 };

    const inserted = await tx
      .insert(flagExposures)
      .values(rows)
      .onConflictDoNothing({
        target: [
          flagExposures.flagId,
          flagExposures.environmentId,
          flagExposures.unitHash,
        ],
      })
      .returning({ id: flagExposures.id });

    return { attributed: inserted.length };
  });
}

/** A single goal event as the SDK sends it. */
export type MetricEventInput = {
  /** The event/metric name (a metric definition matches on this). */
  name: string;
  /** The unit identity — the evaluation targetingKey. */
  targetingKey: string;
  /** Numeric payload for mean/sum metrics; 1 for a plain conversion. */
  value?: number;
  /** Optional client timestamp (ms). */
  timestamp?: number;
};

/**
 * Persist goal events as analysis detail (metric_events). Billing for these is
 * handled separately by the shared durable spine (usage_events, source
 * "flags.metric"); this table carries only what the stats engine joins on.
 */
export async function recordMetricEvents(
  organizationId: string,
  events: MetricEventInput[],
): Promise<{ recorded: number }> {
  if (events.length === 0) return { recorded: 0 };
  const rows = events.map((e) => {
    const occurredAt = new Date(
      typeof e.timestamp === "number" ? e.timestamp : Date.now(),
    );
    return {
      organizationId,
      unitHash: hashUnit(e.targetingKey),
      eventName: e.name,
      value: typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 1,
      occurredAt,
      day: occurredAt.toISOString().slice(0, 10),
    };
  });

  return withOrg(organizationId, async (tx) => {
    await tx.insert(experimentMetricEvents).values(rows);
    return { recorded: rows.length };
  });
}
