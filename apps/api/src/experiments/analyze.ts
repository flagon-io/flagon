import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import type { TenantTx } from "../db/tenant.js";
import { sql } from "../db/schema.js";
import {
  environments,
  experiments,
  experimentMetricLinks,
  experimentMetrics,
  flagEnvironments,
  flagMetricLinks,
  flagVariants,
  flags,
} from "../db/schema.js";
import {
  analyzeContinuous,
  analyzeConversion,
  analyzeCuped,
  correctSignificance,
  sampleSizePerArm,
  type ContinuousArmInput,
  type ConversionArmInput,
  type Correction,
  type CupedArmInput,
  type Direction,
  type MetricAnalysis,
} from "./stats.js";
import { effectiveRetentionDays, retentionSinceDay } from "../lib/retention.js";

/**
 * The outcome analysis read-model, shared by flag-level impact and experiments.
 *
 * Both read from an ENROLLMENT source — a relation of (organization_id, unit_hash,
 * variant_key, first_seen_at), one row per enrolled unit:
 *   - a FLAG'S impact reads flag_exposures (the always-on, flag-lifetime assignment
 *     log) scoped to (flag, environment) — a correctly RETROACTIVE observational
 *     read over the org's retention window (a paid lever; lib/retention.ts);
 *   - an EXPERIMENT reads experiment_exposures scoped to the experiment, so it only
 *     ever analyzes units enrolled DURING its own run (start→stop), not the flag's
 *     pre-experiment history. A stopped experiment additionally caps the response
 *     window at its stop time, freezing the result.
 * A unit's goal events count only if they occurred at/after its enrollment
 * (first_seen_at), so pre-enrollment behavior never leaks in (and is instead the
 * CUPED pre-period covariate). Conversion metrics count distinct converted units;
 * mean/sum/count build a per-unit value (zeros included) and reduce to n / sum /
 * sum-of-squares.
 */

export interface MetricResult {
  metricId: string;
  metricKey: string;
  metricName: string;
  metricType: string;
  role: string;
  direction: Direction;
  analysis: MetricAnalysis;
}

export interface AnalysisResults {
  controlVariantKey: string | null;
  totalUnits: number;
  /** The analysis window (days) applied; null = unlimited. Drives the UI nudge. */
  retentionDays: number | null;
  metrics: MetricResult[];
}

/** A power readout from the primary conversion metric: how big a sample the test
 *  needs to detect `mde` relative change, and how far along enrollment is. */
export interface PowerReadout {
  mde: number;
  baseline: number;
  requiredPerArm: number;
  currentPerArm: number;
}

export interface AnalysisConfig {
  confidenceLevel: number;
  sequential: boolean;
  correction: Correction;
  cuped: boolean;
}

export interface ExperimentResults extends AnalysisResults {
  experimentId: string;
  status: string;
  power: PowerReadout | null;
  analysisConfig: AnalysisConfig;
}

export interface FlagImpactResults extends AnalysisResults {
  flagKey: string;
  environment: string;
}

type AggRow = {
  variant_key: string;
  units: number;
  conversions: number;
  /** Response Y moments (post-exposure): Σy and Σy². */
  sum_y: number;
  sum_yy: number;
  /** Pre-exposure covariate X moments (for CUPED): Σx, Σx², Σxy. */
  sum_x: number;
  sum_xx: number;
  sum_xy: number;
};

/** A metric definition + its role, as fed to the analyzer. */
type MetricInput = {
  metricId: string;
  metricKey: string;
  metricName: string;
  metricType: string;
  eventName: string;
  /** Dot-path into the event properties for the numeric value (sum/mean); null =
   *  use the event's direct `value`. */
  valueField: string | null;
  direction: Direction;
  role: string;
};

/**
 * Aggregate one metric across the arms of an ENROLLMENT relation (`ee`, exposing
 * organization_id, unit_hash, variant_key, first_seen_at). Per unit it derives the
 * response Y from POST-enrollment events and, for CUPED, the covariate X from
 * PRE-enrollment events (same metric, before the unit's enrollment): `conversion`
 * uses "any event" (0/1), `count` the event count, `sum`/`mean` the summed value.
 * When `until` is set (a stopped experiment) the response window is capped at the
 * stop time, freezing the result. Zeros for inactive units come from the LEFT JOIN.
 * Returns per-arm sufficient statistics for both the raw analysis (units,
 * conversions, Σy, Σy²) and the CUPED adjustment (Σx, Σx², Σxy).
 */
async function aggregateImpact(
  tx: TenantTx,
  enrollment: SQL,
  eventName: string,
  metricType: string,
  valueField: string | null,
  until: Date | null,
): Promise<AggRow[]> {
  // Split the unit's events into post-enrollment (the response Y) and pre-enrollment
  // (the covariate X) with FILTER, so one scan yields both without row blow-up. A
  // stopped experiment additionally caps the response at its stop time.
  const untilCap = until ? sql`and me.occurred_at <= ${until.toISOString()}` : sql``;
  const post = sql`me.occurred_at >= ee.first_seen_at ${untilCap}`;
  const pre = sql`me.occurred_at < ee.first_seen_at`;
  // For sum/mean, the per-event number: the metric's value_field (a dot-path) into
  // the event properties when set and numeric, else the event's direct `value`.
  const num = valueField
    ? sql`(case when jsonb_typeof(me.properties #> string_to_array(${valueField}, '.')) = 'number'
                then (me.properties #> string_to_array(${valueField}, '.'))::text::double precision
                else me.value end)`
    : sql`me.value`;
  const yv =
    metricType === "conversion"
      ? sql`((count(me.id) filter (where ${post})) > 0)::int::double precision`
      : metricType === "count"
        ? sql`(count(me.id) filter (where ${post}))::double precision`
        : sql`coalesce(sum(${num}) filter (where ${post}), 0)::double precision`;
  const xv =
    metricType === "conversion"
      ? sql`((count(me.id) filter (where ${pre})) > 0)::int::double precision`
      : metricType === "count"
        ? sql`(count(me.id) filter (where ${pre}))::double precision`
        : sql`coalesce(sum(${num}) filter (where ${pre}), 0)::double precision`;

  const rows = await tx.execute(sql`
    with per_unit as (
      select ee.variant_key as variant_key,
             ee.unit_hash as unit_hash,
             ${yv} as yv,
             ${xv} as xv
      from (${enrollment}) ee
      left join experiment_metric_events me
        on me.organization_id = ee.organization_id
       and me.unit_hash = ee.unit_hash
       and me.event_name = ${eventName}
      group by ee.variant_key, ee.unit_hash
    )
    select variant_key,
           count(*)::int as units,
           coalesce(sum(case when yv > 0 then 1 else 0 end), 0)::int as conversions,
           coalesce(sum(yv), 0)::double precision as sum_y,
           coalesce(sum(yv * yv), 0)::double precision as sum_yy,
           coalesce(sum(xv), 0)::double precision as sum_x,
           coalesce(sum(xv * xv), 0)::double precision as sum_xx,
           coalesce(sum(xv * yv), 0)::double precision as sum_xy
    from per_unit
    group by variant_key
  `);

  return (rows as unknown as AggRow[]).map((r) => ({
    variant_key: r.variant_key,
    units: Number(r.units),
    conversions: Number(r.conversions),
    sum_y: Number(r.sum_y),
    sum_yy: Number(r.sum_yy),
    sum_x: Number(r.sum_x),
    sum_xx: Number(r.sum_xx),
    sum_xy: Number(r.sum_xy),
  }));
}

/** Run every metric against a control over an ENROLLMENT relation, in the window. */
async function computeMetrics(
  tx: TenantTx,
  enrollment: SQL,
  controlKey: string | null,
  metrics: MetricInput[],
  until: Date | null,
  confidence = 0.95,
  cuped = false,
): Promise<{ metrics: MetricResult[]; totalUnits: number }> {
  const results: MetricResult[] = [];
  let totalUnits = 0;

  for (const m of metrics) {
    const agg = await aggregateImpact(tx, enrollment, m.eventName, m.metricType, m.valueField, until);

    let analysis: MetricAnalysis;
    if (cuped) {
      // CUPED adjusts the response by the pre-period covariate and analyzes the
      // real-valued Y* as continuous, regardless of the metric's native family.
      const arms: CupedArmInput[] = agg.map((r) => ({
        variantKey: r.variant_key,
        isControl: r.variant_key === controlKey,
        n: r.units,
        sumY: r.sum_y,
        sumYY: r.sum_yy,
        sumX: r.sum_x,
        sumXX: r.sum_xx,
        sumXY: r.sum_xy,
      }));
      analysis = analyzeCuped(arms, { direction: m.direction, confidence });
    } else if (m.metricType === "conversion") {
      const arms: ConversionArmInput[] = agg.map((r) => ({
        variantKey: r.variant_key,
        isControl: r.variant_key === controlKey,
        units: r.units,
        conversions: r.conversions,
      }));
      analysis = analyzeConversion(arms, { direction: m.direction, confidence });
    } else {
      const arms: ContinuousArmInput[] = agg.map((r) => ({
        variantKey: r.variant_key,
        isControl: r.variant_key === controlKey,
        n: r.units,
        sum: r.sum_y,
        sumSq: r.sum_yy,
      }));
      analysis = analyzeContinuous(arms, { direction: m.direction, confidence });
    }

    if (results.length === 0) totalUnits = agg.reduce((s, r) => s + r.units, 0);
    results.push({
      metricId: m.metricId,
      metricKey: m.metricKey,
      metricName: m.metricName,
      metricType: m.metricType,
      role: m.role,
      direction: m.direction,
      analysis,
    });
  }

  return { metrics: results, totalUnits };
}

/** A power readout from the primary (or first) conversion metric: sample size per
 *  arm needed to detect a 10% relative change, and current enrollment. */
function powerFrom(metrics: MetricResult[]): PowerReadout | null {
  const m =
    metrics.find((r) => r.role === "primary" && r.metricType === "conversion") ??
    metrics.find((r) => r.metricType === "conversion");
  if (!m) return null;
  const vs = m.analysis.variants;
  const control = vs.find((v) => v.isControl);
  if (!control || control.estimate <= 0 || vs.length === 0) return null;
  const mde = 0.1;
  return {
    mde,
    baseline: control.estimate,
    requiredPerArm: sampleSizePerArm(control.estimate, mde),
    currentPerArm: Math.min(...vs.map((v) => v.units)),
  };
}

/** Distinct enrolled units in an enrollment relation — enrollment before any metric. */
async function exposedUnits(tx: TenantTx, enrollment: SQL): Promise<number> {
  const rows = await tx.execute(sql`
    select count(distinct unit_hash)::int as units from (${enrollment}) ee
  `);
  return Number((rows as unknown as { units: number }[])[0]?.units ?? 0);
}

/**
 * Compute the statistical readout for an EXPERIMENT: its attached metrics (with
 * roles), each analyzed across the flag's arms with the experiment's control as
 * baseline. Scoped to the experiment's OWN enrollment (experiment_exposures) — only
 * units enrolled during the run — with retention as an outer clamp and the stop
 * time (if any) freezing the response window.
 */
export async function analyzeExperiment(
  organizationId: string,
  experimentId: string,
): Promise<ExperimentResults | null> {
  const retentionDays = await effectiveRetentionDays(organizationId);
  const sinceDay = retentionSinceDay(retentionDays);

  return withOrg(organizationId, async (tx) => {
    const [exp] = await tx
      .select()
      .from(experiments)
      .where(
        and(
          eq(experiments.id, experimentId),
          eq(experiments.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!exp) return null;

    const attached = await tx
      .select({
        metricId: experimentMetrics.id,
        metricKey: experimentMetrics.key,
        metricName: experimentMetrics.name,
        // The FROZEN snapshot for this experiment (0035); fall back to the live
        // metric only for older links whose snapshot is null.
        snapType: experimentMetricLinks.metricType,
        snapEvent: experimentMetricLinks.eventName,
        snapValueField: experimentMetricLinks.valueField,
        snapDirection: experimentMetricLinks.direction,
        liveType: experimentMetrics.type,
        liveEvent: experimentMetrics.eventName,
        liveValueField: experimentMetrics.valueField,
        liveDirection: experimentMetrics.direction,
        role: experimentMetricLinks.role,
      })
      .from(experimentMetricLinks)
      .innerJoin(experimentMetrics, eq(experimentMetrics.id, experimentMetricLinks.metricId))
      .where(
        and(
          eq(experimentMetricLinks.experimentId, experimentId),
          eq(experimentMetricLinks.organizationId, organizationId),
        ),
      );

    const metricInputs: MetricInput[] = attached.map((m) => {
      const direction = m.snapDirection ?? m.liveDirection;
      // Snapshot type/event travel together; use the snapshot's value_field only when
      // the snapshot itself is present, else the live definition's.
      const snapshotted = m.snapType !== null;
      return {
        metricId: m.metricId,
        metricKey: m.metricKey,
        metricName: m.metricName,
        metricType: m.snapType ?? m.liveType,
        eventName: m.snapEvent ?? m.liveEvent,
        valueField: snapshotted ? m.snapValueField : m.liveValueField,
        direction: direction === "decrease" ? "decrease" : "increase",
        role: m.role,
      };
    });

    // Enrollment = this experiment's own frozen assignments, retention-clamped.
    const enrollment = sql`
      select organization_id, unit_hash, variant_key, first_seen_at
      from experiment_exposures
      where experiment_id = ${experimentId}
        and organization_id = ${organizationId}
        ${sinceDay ? sql`and day >= ${sinceDay}` : sql``}
    `;
    // A stopped experiment freezes: no response events past the stop time.
    const until = exp.status === "stopped" ? exp.stoppedAt : null;

    const confidenceLevel = exp.confidenceLevel ?? 95;
    const correction: Correction =
      exp.correction === "bonferroni" || exp.correction === "bh" ? exp.correction : "none";
    const cuped = exp.cuped ?? false;
    const { metrics, totalUnits } = await computeMetrics(
      tx,
      enrollment,
      exp.controlVariantKey,
      metricInputs,
      until,
      confidenceLevel / 100,
      cuped,
    );

    // Multiple-hypothesis correction is applied WITHIN each metric ROLE family, not
    // across every metric at once. Lumping them together let unrelated secondary and
    // guardrail metrics dilute a genuine PRIMARY win (and made guardrail regressions
    // HARDER to detect — the opposite of a guardrail's job). Each role (primary /
    // secondary / guardrail / watched) is its own family of treatment×metric p-values.
    const alpha = 1 - confidenceLevel / 100;
    const byRole = new Map<
      string,
      { mi: number; vi: number; p: number | null; sp: number | null }[]
    >();
    metrics.forEach((mr, mi) =>
      mr.analysis.variants.forEach((v, vi) => {
        if (v.isControl) return;
        const role = mr.role || "secondary";
        const group = byRole.get(role) ?? [];
        group.push({ mi, vi, p: v.pValue, sp: v.sequentialPValue });
        byRole.set(role, group);
      }),
    );
    for (const group of byRole.values()) {
      // Correct BOTH decision families so whichever mode the experiment runs in
      // (fixed vs sequential/always-valid) is multiplicity-aware. The sequential call
      // keeps its "CI excludes zero" requirement and only gets STRICTER under the
      // correction (never turns a non-significant result significant).
      const fixed = correctSignificance(group.map((g) => g.p), alpha, correction);
      const seq = correctSignificance(group.map((g) => g.sp), alpha, correction);
      group.forEach((g, k) => {
        const va = metrics[g.mi]!.analysis.variants[g.vi]!;
        va.significant = fixed[k]!;
        va.sequentiallySignificant = va.sequentiallySignificant && seq[k]!;
      });
    }

    return {
      experimentId,
      status: exp.status,
      controlVariantKey: exp.controlVariantKey,
      analysisConfig: {
        confidenceLevel,
        sequential: exp.sequential ?? true,
        correction,
        cuped,
      },
      totalUnits:
        metrics.length > 0 ? totalUnits : await exposedUnits(tx, enrollment),
      retentionDays,
      power: powerFrom(metrics),
      metrics,
    };
  });
}

/**
 * Compute always-on IMPACT for a flag: the metrics watched on it (flag_metric_links),
 * each analyzed across the flag's variants with the environment's DEFAULT variant as
 * the implicit control, over the retention window — no experiment required.
 */
export async function analyzeFlag(
  organizationId: string,
  flagKey: string,
  environmentKey: string,
): Promise<FlagImpactResults | null> {
  const retentionDays = await effectiveRetentionDays(organizationId);
  const sinceDay = retentionSinceDay(retentionDays);

  return withOrg(organizationId, async (tx) => {
    const [flag] = await tx
      .select({ id: flags.id })
      .from(flags)
      .where(and(eq(flags.organizationId, organizationId), eq(flags.key, flagKey)))
      .limit(1);
    if (!flag) return null;

    const [env] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.organizationId, organizationId), eq(environments.key, environmentKey)))
      .limit(1);
    if (!env) return null;

    // The env's default variant is the implicit control for flag-level impact.
    const [control] = await tx
      .select({ key: flagVariants.key })
      .from(flagEnvironments)
      .innerJoin(flagVariants, eq(flagVariants.id, flagEnvironments.defaultVariantId))
      .where(
        and(
          eq(flagEnvironments.flagId, flag.id),
          eq(flagEnvironments.environmentId, env.id),
        ),
      )
      .limit(1);
    const controlKey = control?.key ?? null;

    const watched = await tx
      .select({
        metricId: experimentMetrics.id,
        metricKey: experimentMetrics.key,
        metricName: experimentMetrics.name,
        metricType: experimentMetrics.type,
        eventName: experimentMetrics.eventName,
        valueField: experimentMetrics.valueField,
        direction: experimentMetrics.direction,
      })
      .from(flagMetricLinks)
      .innerJoin(experimentMetrics, eq(experimentMetrics.id, flagMetricLinks.metricId))
      .where(
        and(
          eq(flagMetricLinks.flagId, flag.id),
          eq(flagMetricLinks.organizationId, organizationId),
        ),
      );

    const metricInputs: MetricInput[] = watched.map((m) => ({
      metricId: m.metricId,
      metricKey: m.metricKey,
      metricName: m.metricName,
      metricType: m.metricType,
      eventName: m.eventName,
      valueField: m.valueField,
      direction: m.direction === "decrease" ? "decrease" : "increase",
      role: "watched",
    }));

    // Flag-level impact is the always-on, retroactive read over flag_exposures.
    const enrollment = sql`
      select organization_id, unit_hash, variant_key, first_seen_at
      from flag_exposures
      where flag_id = ${flag.id}
        and environment_id = ${env.id}
        and organization_id = ${organizationId}
        ${sinceDay ? sql`and day >= ${sinceDay}` : sql``}
    `;

    const { metrics, totalUnits } = await computeMetrics(
      tx,
      enrollment,
      controlKey,
      metricInputs,
      null,
    );

    return {
      flagKey,
      environment: environmentKey,
      controlVariantKey: controlKey,
      totalUnits:
        metrics.length > 0 ? totalUnits : await exposedUnits(tx, enrollment),
      retentionDays,
      metrics,
    };
  });
}
