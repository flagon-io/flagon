import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { environments, flagEvalRollups, flags, usageEventRollups } from "../db/schema.js";
import {
  CHECKS_METER,
  EVENTS_METER,
  METERS,
  SOURCE_METERS,
  chargeCents,
  sourceMeter,
  type Meter,
} from "./meters.js";

/**
 * Org-wide usage for the console usage page — a BILLING view.
 *
 * The billable structure is by meter: flag checks are free/unlimited (from
 * flag_eval_rollups) and events are the money meter (from usage_event_rollups).
 * The `flag`/`environment`/`reason` groupings are lenses that slice the free
 * checks meter for exploration; only the `meter` grouping surfaces the billable
 * Events line. Charges run through the meter registry, so free meters always read
 * $0 and the dollar figures move the moment a billable rate does. Runs inside
 * withOrg() — RLS scopes the read.
 */

export type UsageGroupBy = "meter" | "flag" | "environment" | "reason";

/** One day's usage + charge for a single series, aligned to `periods`. */
export type UsagePoint = { start: string; usage: number; chargeCents: number };

/** A stacked series: a meter, or a slice of the checks meter (a flag/env/reason). */
export type UsageSeries = {
  /** Stable key (meter id, or env/flag/reason key) — identity for color, not the label. */
  key: string;
  /** Display name. */
  label: string;
  /** The product this line rolls up under, for the invoice's per-product bands. */
  product: string;
  usage: number;
  chargeCents: number;
  /** Whether this line is charged for. Free lines render "Free" instead of a price. */
  billable: boolean;
  /** Whether Flagon records this meter yet (Events is not, so its 0 is "not metered"). */
  tracked: boolean;
  /** The unit the usage is counted in (check / event). */
  unit: string;
  /** Price per 1,000,000 units, in cents (0 for free). */
  pricePerMillionCents: number;
  /** Per-day points, ascending, one per entry in `periods`. */
  points: UsagePoint[];
};

export type OrgUsage = {
  range: { from: string; to: string };
  groupBy: UsageGroupBy;
  currency: "usd";
  /** The product these meters roll up under (the table's group header). */
  product: string;
  /** Day starts (YYYY-MM-DD), ascending. The x-axis; series points align to it. */
  periods: string[];
  /** Series sorted by usage, descending. */
  series: UsageSeries[];
  totals: {
    /** Total usage across all series (billable and free). */
    usage: number;
    /** Usage on billable meters only. */
    billableUsage: number;
    /** Charge in cents (billable meters only). */
    chargeCents: number;
  };
};

/**
 * An OFREP resolution reason (TARGETING_MATCH, DEFAULT, DISABLED, ERROR, …) as a
 * readable label: "TARGETING_MATCH" -> "Targeting match". The raw constant stays
 * the series key; only the display label is prettified.
 */
function prettyReason(reason: string): string {
  if (!reason) return "Unknown";
  const words = reason.toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (words.length === 0) return "Unknown";
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Inclusive list of YYYY-MM-DD day starts from `from` to `to`, in UTC. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (
    let t = new Date(`${from}T00:00:00Z`).getTime();
    t <= end;
    t += 24 * 60 * 60 * 1000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Attach a meter's billing attributes and priced points to a raw usage line. */
function toSeries(
  meter: Meter,
  key: string,
  label: string,
  counts: number[],
  periods: string[],
): UsageSeries {
  const usage = counts.reduce((sum, c) => sum + c, 0);
  return {
    key,
    label,
    product: meter.product,
    usage,
    chargeCents: chargeCents(meter, usage),
    billable: meter.billable,
    tracked: meter.tracked,
    unit: meter.unit,
    pricePerMillionCents: meter.pricePerMillionCents,
    points: counts.map((u, i) => ({
      start: periods[i]!,
      usage: u,
      chargeCents: chargeCents(meter, u),
    })),
  };
}

export async function orgUsage(
  tx: TenantTx,
  opts: { from: string; to: string; groupBy: UsageGroupBy },
): Promise<OrgUsage> {
  const { from, to, groupBy } = opts;
  const periods = daysBetween(from, to);
  const periodIndex = new Map(periods.map((d, i) => [d, i]));
  const zero = () => new Array(periods.length).fill(0);

  const inRange = and(gte(flagEvalRollups.day, from), lte(flagEvalRollups.day, to));
  const total = sql<string>`sum(${flagEvalRollups.count})`;

  // Every grouping reads the same free checks meter (flag_eval_rollups), split by
  // a chosen dimension. "meter" collapses to one "Flag checks" line; the others
  // slice it by flag / environment / reason. Normalize into { day, key, label }.
  type NormRow = { day: string; key: string; label: string; count: number };
  let rows: NormRow[];

  if (groupBy === "meter") {
    const r = await tx
      .select({ day: flagEvalRollups.day, count: total })
      .from(flagEvalRollups)
      .where(inRange)
      .groupBy(flagEvalRollups.day);
    rows = r.map((x) => ({
      day: x.day,
      key: CHECKS_METER.id,
      label: CHECKS_METER.label,
      count: Number(x.count),
    }));
  } else if (groupBy === "reason") {
    const r = await tx
      .select({ day: flagEvalRollups.day, reason: flagEvalRollups.reason, count: total })
      .from(flagEvalRollups)
      .where(inRange)
      .groupBy(flagEvalRollups.day, flagEvalRollups.reason);
    rows = r.map((x) => ({
      day: x.day,
      key: x.reason || "UNKNOWN",
      label: prettyReason(x.reason),
      count: Number(x.count),
    }));
  } else if (groupBy === "flag") {
    const r = await tx
      .select({ day: flagEvalRollups.day, key: flags.key, label: flags.name, count: total })
      .from(flagEvalRollups)
      .innerJoin(flags, eq(flags.id, flagEvalRollups.flagId))
      .where(inRange)
      .groupBy(flagEvalRollups.day, flags.key, flags.name);
    rows = r.map((x) => ({ day: x.day, key: x.key, label: x.label, count: Number(x.count) }));
  } else {
    const r = await tx
      .select({
        day: flagEvalRollups.day,
        key: environments.key,
        label: environments.name,
        count: total,
      })
      .from(flagEvalRollups)
      .innerJoin(environments, eq(environments.id, flagEvalRollups.environmentId))
      .where(inRange)
      .groupBy(flagEvalRollups.day, environments.key, environments.name);
    rows = r.map((x) => ({ day: x.day, key: x.key, label: x.label, count: Number(x.count) }));
  }

  // Fold the rows into per-line daily counts (all lines are the free checks meter).
  const acc = new Map<string, { key: string; label: string; counts: number[] }>();
  for (const r of rows) {
    const i = periodIndex.get(r.day);
    if (i === undefined) continue;
    let s = acc.get(r.key);
    if (!s) {
      s = { key: r.key, label: r.label, counts: zero() };
      acc.set(r.key, s);
    }
    s.counts[i] += r.count;
  }

  const series: UsageSeries[] = [...acc.values()]
    .map((s) => toSeries(CHECKS_METER, s.key, s.label, s.counts, periods))
    .sort((a, b) => b.usage - a.usage);

  // The billable Events meter belongs to the billing (meter) view. Broken down BY
  // SOURCE so the usage table shows per-product bands: flag exposures under Feature
  // Flags today, and each future product's events under its own band. The meter,
  // rate, and shared credit stay unified — only the DISPLAY attributes each line to
  // the product that produced it. Priced at the full per-unit rate here; the per-plan
  // free allowance (Hobby 500K / Pro 1M) is applied by the usage page (it knows the plan).
  if (groupBy === "meter") {
    const evRows = await tx
      .select({
        day: usageEventRollups.day,
        source: usageEventRollups.source,
        count: sql<string>`sum(${usageEventRollups.count})`,
      })
      .from(usageEventRollups)
      .where(and(gte(usageEventRollups.day, from), lte(usageEventRollups.day, to)))
      .groupBy(usageEventRollups.day, usageEventRollups.source);

    // Seed every KNOWN billable source at zero so its line is always visible (a
    // billing view should show what you're metered on, even before any usage),
    // mirroring the always-present free checks line. New sources appear on data.
    const bySource = new Map<string, number[]>(
      Object.keys(SOURCE_METERS).map((src) => [src, zero()]),
    );
    for (const r of evRows) {
      const i = periodIndex.get(r.day);
      if (i === undefined) continue;
      let counts = bySource.get(r.source);
      if (!counts) {
        counts = zero();
        bySource.set(r.source, counts);
      }
      counts[i] += Number(r.count);
    }

    for (const [source, counts] of bySource) {
      const sm = sourceMeter(source);
      // Price each source under its OWN meter: exposures/metric events under the
      // `events` money meter, but check runs under the two-tier check-run meters
      // (uptime cheap, browser ~25x). The meter drives the rate + billable flag; the
      // source drives the product band. Falls back to the events meter for a source
      // with no explicit meter mapping.
      const meter = (sm && METERS[sm.meterId]) || EVENTS_METER;
      const line = toSeries(meter, `${meter.id}:${source}`, sm?.label ?? meter.label, counts, periods);
      // Attribute to the producing product (a meter may be platform-level; the
      // source carries the product). This is what gives the table its per-product bands.
      line.product = sm?.product ?? meter.product;
      series.push(line);
    }
  }

  const totalUsage = series.reduce((sum, s) => sum + s.usage, 0);
  const billableUsage = series
    .filter((s) => s.billable)
    .reduce((sum, s) => sum + s.usage, 0);
  const chargeTotal = series.reduce((sum, s) => sum + s.chargeCents, 0);

  return {
    range: { from, to },
    groupBy,
    currency: "usd",
    product: CHECKS_METER.product,
    periods,
    series,
    totals: { usage: totalUsage, billableUsage, chargeCents: chargeTotal },
  };
}
