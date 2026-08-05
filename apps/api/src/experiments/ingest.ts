import { and, eq, inArray } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { hashUnit } from "../lib/unit-hash.js";
import { bucket } from "../flags/bucket.js";
import {
  flagExposures,
  flags,
  experiments,
  experimentExposures,
  experimentMetricEvents,
} from "../db/schema.js";

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
 * powers flag-level impact for any flag.
 *
 * In the SAME pass, ENROLL the unit into any experiment that is RUNNING on that
 * flag+environment: one row in experiment_exposures per (experiment, unit), frozen
 * on first exposure DURING the run and gated by the experiment's `allocation`
 * (a deterministic per-unit bucket). This is what makes an experiment analyze only
 * its own window (start→stop) and lets a repeat experiment on the same flag get a
 * fresh enrollment set — a unit already frozen in flag_exposures still enrolls fresh
 * per experiment. Events missing variant/targetingKey, or naming an unknown flag,
 * are skipped — metering already happened, this is additive analytics.
 */
export async function attributeExposures(
  organizationId: string,
  environmentId: string,
  events: ExposureEvent[],
  atMs?: number,
): Promise<{ attributed: number; enrolled: number }> {
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
  if (usable.length === 0) return { attributed: 0, enrolled: 0 };

  const flagKeys = [...new Set(usable.map((e) => e.flagKey))];
  const day = dayOf(atMs);

  return withOrg(organizationId, async (tx) => {
    // Resolve the batch's flag keys to ids once (org-scoped by RLS).
    const flagRows = await tx
      .select({ id: flags.id, key: flags.key })
      .from(flags)
      .where(inArray(flags.key, flagKeys));
    if (flagRows.length === 0) return { attributed: 0, enrolled: 0 };
    const idByKey = new Map<string, string>();
    for (const f of flagRows) idByKey.set(f.key, f.id);

    // Precompute (flagId, unitHash, variant) once — reused for both writes.
    const attributions = usable
      .map((e) => {
        const flagId = idByKey.get(e.flagKey);
        if (!flagId) return null;
        return { flagId, variantKey: e.variant, unitHash: hashUnit(e.targetingKey) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (attributions.length === 0) return { attributed: 0, enrolled: 0 };

    // --- Always-on flag-level assignment ------------------------------------
    const inserted = await tx
      .insert(flagExposures)
      .values(attributions.map((a) => ({ organizationId, environmentId, day, ...a })))
      .onConflictDoNothing({
        target: [
          flagExposures.flagId,
          flagExposures.environmentId,
          flagExposures.unitHash,
        ],
      })
      .returning({ id: flagExposures.id });

    // --- Per-experiment enrollment (running experiments on these flags) ------
    const flagIds = [...new Set(attributions.map((a) => a.flagId))];
    const running = await tx
      .select({ id: experiments.id, flagId: experiments.flagId, allocation: experiments.allocation })
      .from(experiments)
      .where(
        and(
          eq(experiments.environmentId, environmentId),
          eq(experiments.status, "running"),
          inArray(experiments.flagId, flagIds),
        ),
      );

    let enrolled = 0;
    if (running.length > 0) {
      const byFlag = new Map<string, { id: string; allocation: number }[]>();
      for (const r of running) {
        const list = byFlag.get(r.flagId) ?? [];
        list.push({ id: r.id, allocation: r.allocation });
        byFlag.set(r.flagId, list);
      }
      const enrollRows = attributions.flatMap((a) => {
        const exps = byFlag.get(a.flagId);
        if (!exps) return [];
        return exps
          // Allocation gate: a deterministic, stable per-(experiment, unit) bucket.
          // allocation=100 → threshold 1.0 → everyone eligible enrolls.
          .filter((x) => bucket(`${x.id}:${a.unitHash}`) < x.allocation / 100)
          .map((x) => ({
            organizationId,
            experimentId: x.id,
            variantKey: a.variantKey,
            unitHash: a.unitHash,
            day,
          }));
      });
      if (enrollRows.length > 0) {
        const enr = await tx
          .insert(experimentExposures)
          .values(enrollRows)
          .onConflictDoNothing({
            target: [experimentExposures.experimentId, experimentExposures.unitHash],
          })
          .returning({ id: experimentExposures.id });
        enrolled = enr.length;
      }
    }

    return { attributed: inserted.length, enrolled };
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
  /** Arbitrary event payload; a metric's value_field extracts a number from it. */
  properties?: Record<string, unknown>;
  /** Optional client timestamp (ms). */
  timestamp?: number;
};

/**
 * Persist goal events as analysis detail (metric_events). Billing for these is
 * handled separately by the shared durable spine (usage_events, source
 * "experiments.metric"); this table carries only what the stats engine joins on.
 *
 * IDEMPOTENT: with an `idempotencyKey` (the /track batch's Idempotency-Key header)
 * each row is stamped "<key>:<index>" behind a partial unique index and inserted via
 * ON CONFLICT DO NOTHING, so a retried batch is stored EXACTLY ONCE — billing already
 * dedups on the same key, and without this the metric rows would double and inflate
 * every count/sum/mean lift. Keyless batches (no header) aren't deduped (the client
 * opted out), matching the billing side. `recorded` counts rows actually inserted.
 */
export async function recordMetricEvents(
  organizationId: string,
  events: MetricEventInput[],
  idempotencyKey?: string,
): Promise<{ recorded: number }> {
  if (events.length === 0) return { recorded: 0 };
  const rows = events.map((e, i) => {
    const occurredAt = new Date(
      typeof e.timestamp === "number" ? e.timestamp : Date.now(),
    );
    return {
      organizationId,
      unitHash: hashUnit(e.targetingKey),
      eventName: e.name,
      value: typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 1,
      properties:
        e.properties && typeof e.properties === "object" ? e.properties : null,
      occurredAt,
      day: occurredAt.toISOString().slice(0, 10),
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:${i}` : null,
    };
  });

  return withOrg(organizationId, async (tx) => {
    const inserted = await tx
      .insert(experimentMetricEvents)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: experimentMetricEvents.id });
    return { recorded: inserted.length };
  });
}
