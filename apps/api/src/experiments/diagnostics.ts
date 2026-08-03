import { and, desc, eq, inArray } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { sql } from "../db/schema.js";
import {
  experiments,
  experimentMetricLinks,
  experimentMetricEvents,
  experimentMetrics,
  flagExposures,
} from "../db/schema.js";

/**
 * Experiment diagnostics — the "is my data actually arriving and attributing?"
 * trust surface (Statsig's Diagnostics / Exposure Stream). Reads the raw
 * attribution truth: per-arm exposure counts, the most recent attributed exposures
 * (which unit saw which arm, when), and the most recent goal events for the
 * experiment's metrics. Units are the salted hash we store — never a raw targeting
 * key — so this is honest AND privacy-preserving (we hold no PII to leak).
 */

export interface DiagnosticsExposure {
  unit: string;
  variant: string;
  at: string;
}
export interface DiagnosticsEvent {
  unit: string;
  event: string;
  value: number;
  at: string;
}
export interface ExperimentDiagnostics {
  arms: { variant: string; units: number }[];
  totals: { exposures: number; events: number };
  recentExposures: DiagnosticsExposure[];
  recentEvents: DiagnosticsEvent[];
}

const STREAM_LIMIT = 50;
/** Show a readable slice of the unit hash (it is already a one-way salted hash). */
const shortUnit = (h: string) => h.slice(0, 12);

export async function experimentDiagnostics(
  organizationId: string,
  experimentKey: string,
): Promise<ExperimentDiagnostics | null> {
  return withOrg(organizationId, async (tx) => {
    const [exp] = await tx
      .select({ flagId: experiments.flagId, environmentId: experiments.environmentId, id: experiments.id })
      .from(experiments)
      .where(and(eq(experiments.organizationId, organizationId), eq(experiments.key, experimentKey)))
      .limit(1);
    if (!exp) return null;

    // The metric event names this experiment measures.
    const metricRows = await tx
      .select({ eventName: experimentMetrics.eventName })
      .from(experimentMetricLinks)
      .innerJoin(experimentMetrics, eq(experimentMetrics.id, experimentMetricLinks.metricId))
      .where(eq(experimentMetricLinks.experimentId, exp.id));
    const eventNames = [...new Set(metricRows.map((m) => m.eventName))];

    // Per-arm distinct exposed units.
    const armRows = (await tx.execute(sql`
      select variant_key, count(distinct unit_hash)::int as units
      from flag_exposures
      where flag_id = ${exp.flagId}
        and environment_id = ${exp.environmentId}
        and organization_id = ${organizationId}
      group by variant_key
      order by units desc
    `)) as unknown as { variant_key: string; units: number }[];
    const arms = armRows.map((r) => ({ variant: r.variant_key, units: Number(r.units) }));
    const totalExposures = arms.reduce((s, a) => s + a.units, 0);

    // The most recent attributed exposures.
    const recentExp = await tx
      .select({
        unit: flagExposures.unitHash,
        variant: flagExposures.variantKey,
        at: flagExposures.firstSeenAt,
      })
      .from(flagExposures)
      .where(
        and(
          eq(flagExposures.flagId, exp.flagId),
          eq(flagExposures.environmentId, exp.environmentId),
        ),
      )
      .orderBy(desc(flagExposures.firstSeenAt))
      .limit(STREAM_LIMIT);

    // The most recent goal events for this experiment's metrics.
    let recentEvents: DiagnosticsEvent[] = [];
    let totalEvents = 0;
    if (eventNames.length > 0) {
      const rows = await tx
        .select({
          unit: experimentMetricEvents.unitHash,
          event: experimentMetricEvents.eventName,
          value: experimentMetricEvents.value,
          at: experimentMetricEvents.occurredAt,
        })
        .from(experimentMetricEvents)
        .where(
          and(
            eq(experimentMetricEvents.organizationId, organizationId),
            inArray(experimentMetricEvents.eventName, eventNames),
          ),
        )
        .orderBy(desc(experimentMetricEvents.occurredAt))
        .limit(STREAM_LIMIT);
      recentEvents = rows.map((r) => ({
        unit: shortUnit(r.unit),
        event: r.event,
        value: r.value,
        at: r.at.toISOString(),
      }));
      const [{ n } = { n: 0 }] = (await tx.execute(sql`
        select count(*)::int as n
        from experiment_metric_events
        where organization_id = ${organizationId}
          and event_name in (${sql.join(eventNames.map((e) => sql`${e}`), sql`, `)})
      `)) as unknown as { n: number }[];
      totalEvents = Number(n);
    }

    return {
      arms,
      totals: { exposures: totalExposures, events: totalEvents },
      recentExposures: recentExp.map((r) => ({
        unit: shortUnit(r.unit),
        variant: r.variant,
        at: r.at.toISOString(),
      })),
      recentEvents,
    };
  });
}
