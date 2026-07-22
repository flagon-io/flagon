import type { FlagType } from "./flags";

/**
 * Per-flag usage metrics and staleness - PURE DATA MATH, importable from client
 * components so the flags list, the detail page, and the REST endpoint all quote
 * the same numbers. The database read layer lives in flag-usage.server.ts.
 *
 * The inputs come from flag_usage_rollups (drizzle/0031): counts by served
 * variant and reason. Nothing here sees a targeting identity - only outcomes.
 */

/** Why a variant was served (src/lib/flags.ts evaluateFlag). */
export const EXPOSURE_REASONS = ["STATIC", "TARGETING_MATCH", "SPLIT"] as const;
export type ExposureReason = (typeof EXPOSURE_REASONS)[number];

export function isExposureReason(value: string): value is ExposureReason {
  return (EXPOSURE_REASONS as readonly string[]).includes(value);
}

/** One point of a per-flag time series (hour or day, ISO). */
export type UsagePoint = { at: string; count: number };

export type VariantCount = { variantKey: string; count: number };

/**
 * A flag's usage, as the UI and API render it.
 *
 * The primary fields (`totalChecks`, `series`, `byVariant`, `byReason`) count
 * SERVED evaluations - the ones the server billed (bulk + single-flag) - so the
 * per-flag view reconciles with the invoice. `exposed*` counts what the client
 * hook reported the app actually READ; it is a different scale from billing and
 * exists to drive staleness ("billed on every fetch, but never read"). A flag
 * with no data has zero checks and null timestamps, shown as an honest "no data
 * yet" rather than a faked line.
 */
export type FlagUsage = {
  totalChecks: number;
  checksPerHour: number;
  lastCheckedAt: string | null;
  byVariant: VariantCount[];
  byReason: Record<ExposureReason, number>;
  series: UsagePoint[];
  /** Client-hook app reads (real usage), for staleness. */
  exposedChecks: number;
  exposedLastAt: string | null;
};

/**
 * The window the checks/hr rate is averaged over. A rate needs a denominator,
 * and "per hour over the last day" is both the intuitive reading of "checks/hr"
 * and stable against a single busy minute.
 */
export const RATE_WINDOW_HOURS = 24;

/**
 * Average checks per hour over the last RATE_WINDOW_HOURS, given an hourly
 * series. Averaged over the whole window (not only hours with traffic), so a
 * flag checked hard for one hour a day reads as its true sustained rate, not its
 * peak.
 */
export function checksPerHour(hourly: UsagePoint[], now: Date): number {
  const cutoff = now.getTime() - RATE_WINDOW_HOURS * 3_600_000;
  let total = 0;
  for (const point of hourly) {
    if (new Date(point.at).getTime() >= cutoff) total += point.count;
  }
  return total / RATE_WINDOW_HOURS;
}

/**
 * Pass rate for a BOOLEAN flag: the share of checks that returned `on`. Null for
 * any other type, where a single percentage is meaningless - the caller shows
 * the variant distribution instead. Null too when there is nothing to divide.
 */
export function passRate(
  byVariant: VariantCount[],
  flagType: FlagType,
): number | null {
  if (flagType !== "boolean") return null;
  const total = byVariant.reduce((sum, v) => sum + v.count, 0);
  if (total <= 0) return null;
  const on = byVariant.find((v) => v.variantKey === "on")?.count ?? 0;
  return on / total;
}

/** Variant distribution as shares, largest first - the multivariate answer. */
export function variantDistribution(
  byVariant: VariantCount[],
): { variantKey: string; count: number; share: number }[] {
  const total = byVariant.reduce((sum, v) => sum + v.count, 0);
  return [...byVariant]
    .sort(
      (a, b) => b.count - a.count || a.variantKey.localeCompare(b.variantKey),
    )
    .map((v) => ({
      variantKey: v.variantKey,
      count: v.count,
      share: total > 0 ? v.count / total : 0,
    }));
}

/**
 * Densify a sparse hourly series into a fixed-length array of the most recent
 * `buckets` hours ending at `now`, so a sparkline has a stable width and gaps
 * read as the zeros they are rather than being drawn over. Index 0 is oldest.
 */
export function recentBuckets(
  points: UsagePoint[],
  now: Date,
  buckets: number,
): number[] {
  const out = new Array<number>(buckets).fill(0);
  const endHour = new Date(now);
  endHour.setUTCMinutes(0, 0, 0);
  const end = endHour.getTime();
  for (const point of points) {
    const t = new Date(point.at).getTime();
    const hoursAgo = Math.floor((end - t) / 3_600_000);
    const index = buckets - 1 - hoursAgo;
    if (index >= 0 && index < buckets) out[index] += point.count;
  }
  return out;
}

/**
 * Densify an hourly series into a fixed-length array of the most recent `days`
 * calendar days ending today (UTC). Index 0 is oldest. For the detail chart,
 * where one bar per day over the window reads better than 720 hourly bars.
 */
export function dailyBuckets(
  points: UsagePoint[],
  now: Date,
  days: number,
): number[] {
  const out = new Array<number>(days).fill(0);
  const endDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  for (const point of points) {
    const t = new Date(point.at);
    const day = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    const daysAgo = Math.floor((endDay - day) / 86_400_000);
    const index = days - 1 - daysAgo;
    if (index >= 0 && index < days) out[index] += point.count;
  }
  return out;
}

/** Days a flag is given before staleness can apply: a grace period for new work. */
export const STALE_AFTER_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export type FlagAssessment = { stale: boolean; reasons: string[] };

/**
 * Whether a flag is a CLEANUP CANDIDATE - never an automatic verdict, always a
 * suggestion with its reasons shown so a person decides.
 *
 * The traffic signal is APP READS (exposures), NOT billed evaluations: a flag
 * served in every bulk config fetch is billed but not necessarily used, so
 * `lastCheckedAt` here is the last EXPOSED read. It is only trustworthy once the
 * org emits exposures at all (the client hook), because an org that hasn't wired
 * it up has no reads for ANY flag. So:
 *
 *   org emits exposures  -> trust reads: stale when unchanged AND not read in
 *                           the window. This is the "billed but never read"
 *                           cleanup candidate.
 *   org emits none yet   -> fall back to configuration: stale only when the flag
 *                           is old, untouched, AND inert (no targeting rules) -
 *                           the classic "left in after a rollout".
 *
 * A brand-new flag is never stale, whatever its traffic, so a rollout in
 * progress is never nagged.
 */
export function assessFlag(
  flag: { createdAt: Date; updatedAt: Date; rules: unknown[] },
  opts: { now: Date; lastCheckedAt: Date | null; orgEmitsExposures: boolean },
): FlagAssessment {
  const { now } = opts;
  const ageDays = (now.getTime() - flag.createdAt.getTime()) / MS_PER_DAY;
  if (ageDays < STALE_AFTER_DAYS) return { stale: false, reasons: [] };

  const unchangedDays = (now.getTime() - flag.updatedAt.getTime()) / MS_PER_DAY;
  const unchanged = unchangedDays >= STALE_AFTER_DAYS;
  const noRules = flag.rules.length === 0;
  const noRecentTraffic =
    !opts.lastCheckedAt ||
    (now.getTime() - opts.lastCheckedAt.getTime()) / MS_PER_DAY >=
      STALE_AFTER_DAYS;

  const reasons: string[] = [];
  if (noRecentTraffic) {
    reasons.push(
      opts.lastCheckedAt
        ? `Not read in ${STALE_AFTER_DAYS} days`
        : "No recorded app reads",
    );
  }
  if (unchanged)
    reasons.push(`Unchanged for ${Math.floor(unchangedDays)} days`);
  if (noRules) reasons.push("No targeting rules");

  const stale = opts.orgEmitsExposures
    ? noRecentTraffic && unchanged
    : noRecentTraffic && unchanged && noRules;

  // Only surface reasons when the verdict is stale, so an active flag never
  // shows a list of "problems" that did not add up to one.
  return stale ? { stale, reasons } : { stale: false, reasons: [] };
}
