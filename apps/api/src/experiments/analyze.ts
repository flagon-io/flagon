import { and, eq } from "drizzle-orm";
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
 * Attribution is always-on and flag-keyed (flag_exposures), so BOTH a plain flag's
 * impact and an experiment analyze the same table — a flag by its default variant,
 * an experiment by a designated control — and both are RETROACTIVE: they analyze
 * all history within the org's retention window (a paid lever; lib/retention.ts),
 * not "since the experiment started." A unit's goal events count only if they
 * occurred at/after its first exposure, so pre-exposure behavior never leaks in.
 * Conversion metrics count distinct converted units; mean/sum/count build a
 * per-unit value (zeros included) and reduce to n / sum / sum-of-squares.
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
  direction: Direction;
  role: string;
};

/**
 * Aggregate one metric across a flag's arms within (flag, environment) and the
 * retention window. Per unit it derives the response Y from POST-exposure events
 * and, for CUPED, the covariate X from PRE-exposure events (same metric, before
 * the unit's first exposure): `conversion` uses "any event" (0/1), `count` the
 * event count, `sum`/`mean` the summed value. Zeros for inactive units come from
 * the LEFT JOIN. Returns per-arm sufficient statistics for both the raw analysis
 * (units, conversions, Σy, Σy²) and the CUPED adjustment (Σx, Σx², Σxy).
 */
async function aggregateImpact(
  tx: TenantTx,
  organizationId: string,
  flagId: string,
  environmentId: string,
  eventName: string,
  metricType: string,
  sinceDay: string | null,
): Promise<AggRow[]> {
  const dayFilter = sinceDay ? sql`and ee.day >= ${sinceDay}` : sql``;
  // Split the unit's events into post-exposure (the response Y) and pre-exposure
  // (the covariate X) with FILTER, so one scan yields both without row blow-up.
  const post = sql`me.occurred_at >= ee.first_seen_at`;
  const pre = sql`me.occurred_at < ee.first_seen_at`;
  const yv =
    metricType === "conversion"
      ? sql`((count(me.id) filter (where ${post})) > 0)::int::double precision`
      : metricType === "count"
        ? sql`(count(me.id) filter (where ${post}))::double precision`
        : sql`coalesce(sum(me.value) filter (where ${post}), 0)::double precision`;
  const xv =
    metricType === "conversion"
      ? sql`((count(me.id) filter (where ${pre})) > 0)::int::double precision`
      : metricType === "count"
        ? sql`(count(me.id) filter (where ${pre}))::double precision`
        : sql`coalesce(sum(me.value) filter (where ${pre}), 0)::double precision`;

  const rows = await tx.execute(sql`
    with per_unit as (
      select ee.variant_key as variant_key,
             ee.unit_hash as unit_hash,
             ${yv} as yv,
             ${xv} as xv
      from flag_exposures ee
      left join experiment_metric_events me
        on me.organization_id = ee.organization_id
       and me.unit_hash = ee.unit_hash
       and me.event_name = ${eventName}
      where ee.flag_id = ${flagId}
        and ee.environment_id = ${environmentId}
        and ee.organization_id = ${organizationId}
        ${dayFilter}
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

/** Run every metric for a (flag, environment) against a control, in the window. */
async function computeMetrics(
  tx: TenantTx,
  organizationId: string,
  flagId: string,
  environmentId: string,
  controlKey: string | null,
  metrics: MetricInput[],
  sinceDay: string | null,
  confidence = 0.95,
  cuped = false,
): Promise<{ metrics: MetricResult[]; totalUnits: number }> {
  const results: MetricResult[] = [];
  let totalUnits = 0;

  for (const m of metrics) {
    const agg = await aggregateImpact(
      tx,
      organizationId,
      flagId,
      environmentId,
      m.eventName,
      m.metricType,
      sinceDay,
    );

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

/** Distinct exposed units for a (flag, env) in the window — enrollment before any metric. */
async function exposedUnits(
  tx: TenantTx,
  organizationId: string,
  flagId: string,
  environmentId: string,
  sinceDay: string | null,
): Promise<number> {
  const dayFilter = sinceDay ? sql`and day >= ${sinceDay}` : sql``;
  const rows = await tx.execute(sql`
    select count(distinct unit_hash)::int as units
    from flag_exposures
    where flag_id = ${flagId}
      and environment_id = ${environmentId}
      and organization_id = ${organizationId}
      ${dayFilter}
  `);
  return Number((rows as unknown as { units: number }[])[0]?.units ?? 0);
}

/**
 * Compute the statistical readout for an EXPERIMENT: its attached metrics (with
 * roles), each analyzed across the flag's arms with the experiment's control as
 * baseline, retroactively over the retention window.
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
        metricType: experimentMetrics.type,
        eventName: experimentMetrics.eventName,
        direction: experimentMetrics.direction,
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

    const metricInputs: MetricInput[] = attached.map((m) => ({
      metricId: m.metricId,
      metricKey: m.metricKey,
      metricName: m.metricName,
      metricType: m.metricType,
      eventName: m.eventName,
      direction: m.direction === "decrease" ? "decrease" : "increase",
      role: m.role,
    }));

    const confidenceLevel = exp.confidenceLevel ?? 95;
    const correction: Correction =
      exp.correction === "bonferroni" || exp.correction === "bh" ? exp.correction : "none";
    const cuped = exp.cuped ?? false;
    const { metrics, totalUnits } = await computeMetrics(
      tx,
      organizationId,
      exp.flagId,
      exp.environmentId,
      exp.controlVariantKey,
      metricInputs,
      sinceDay,
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
        metrics.length > 0
          ? totalUnits
          : await exposedUnits(tx, organizationId, exp.flagId, exp.environmentId, sinceDay),
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
      direction: m.direction === "decrease" ? "decrease" : "increase",
      role: "watched",
    }));

    const { metrics, totalUnits } = await computeMetrics(
      tx,
      organizationId,
      flag.id,
      env.id,
      controlKey,
      metricInputs,
      sinceDay,
    );

    return {
      flagKey,
      environment: environmentKey,
      controlVariantKey: controlKey,
      totalUnits:
        metrics.length > 0
          ? totalUnits
          : await exposedUnits(tx, organizationId, flag.id, env.id, sinceDay),
      retentionDays,
      metrics,
    };
  });
}
