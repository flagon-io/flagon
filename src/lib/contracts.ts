import { startOfDayUTC, type PeriodWindow } from "./billing-period";
import { getMeter, type MeterRate } from "./meters";
import type { PlanId } from "./plans";

/**
 * Contracted envelopes: what a negotiated agreement covers, and how much of it
 * has been consumed.
 *
 * PURE DATA MATH, importable from client components, so the usage page and the
 * REST endpoint quote the same numbers from the same function.
 *
 * The envelope is TERM-WIDE and drawn down CUMULATIVELY. That is the whole
 * design. A contract negotiated from annual usage estimates is not a promise
 * about any particular month, and slicing it into twelve equal monthly buckets
 * would manufacture a breach every summer and hide the recovery every winter.
 * A customer who burns 40% of the year's volume in July and 2% in January is
 * exactly on plan, and the only numbers that say so are cumulative consumption
 * against elapsed term.
 *
 * Nothing here is money. The agreement is denominated in volume; converting it
 * to dollars for display would quote a bill the customer will never receive
 * (see usageDisplay in src/lib/plans.ts).
 */

/** Inclusive ISO-day window (YYYY-MM-DD), matching the rollup grain. */
export type ContractTerm = {
  start: string;
  end: string;
};

/**
 * Whether consumption is tracking ahead of, behind, or in line with the term.
 *
 * Null when no judgement is honest: no contracted volume for the meter, or too
 * little of the term elapsed for a projection to mean anything.
 */
export type ContractPace = "under" | "on" | "over";

export type ContractEnvelope = {
  meter: string;
  label: string;
  unit: string;
  /** Negotiated volume for the whole term; null when this meter has none. */
  contracted: number | null;
  /** Consumed since the term began. */
  used: number;
  remaining: number | null;
  usedPercent: number | null;
  /**
   * Term total at the current average rate. INFORMATIONAL ONLY, and deliberately
   * secondary in every surface that renders it: a linear extrapolation is
   * exactly the wrong lens on seasonal traffic, which is the traffic this model
   * exists to absorb. It answers "if nothing changes", not "what will happen".
   */
  projected: number | null;
  pace: ContractPace | null;
};

export type ContractStatus = {
  term: ContractTerm;
  daysTotal: number;
  daysElapsed: number;
  elapsedPercent: number;
  envelopes: ContractEnvelope[];
};

/* ------------------------------------------------------------------ *
 * Per-meter billing behaviour (the covered-vs-metered model)
 * ------------------------------------------------------------------ */

/**
 * The billing knobs a contract carries, separate from the ContractStatus volume
 * view. Kept as a small structural type (not the whole contract row) so pure
 * pricing/predicate code can take it without pulling in the database layer.
 */
export type ContractBilling = {
  /** Covered meters' term-wide envelopes (volume; not billed). */
  meterAllowances: Record<string, number>;
  /** Metered meters' PER-CYCLE included quantity. */
  meteredAllowances: Record<string, number>;
  /** Optional negotiated overage rate per metered meter. */
  meteredRates: Record<string, { unit_amount_cents: number; per: number }>;
};

/**
 * How a meter is treated when a period closes, matching the billing_mode column
 * (drizzle/0032):
 *
 *   priced   pro/free: the plan rate with pooled credit (unchanged).
 *   covered  enterprise, in the contract's term envelope: volume, never billed.
 *   metered  enterprise, billed on top: per-cycle included, overage auto-billed.
 */
export type BillingMode = "priced" | "covered" | "metered";

/**
 * A meter is COVERED only for an enterprise org and only when the contract names
 * it in its term envelopes. Everything else an enterprise uses is METERED, so a
 * product adopted after the contract was signed bills automatically rather than
 * silently riding for free. Pro and free are always priced (the pre-contract
 * path).
 */
export function meterBillingMode(
  plan: PlanId,
  meterId: string,
  contract?: ContractBilling | null,
): BillingMode {
  if (plan !== "enterprise") return "priced";
  if (contract && meterId in contract.meterAllowances) return "covered";
  return "metered";
}

/** Whether a meter's usage auto-attaches to the org's Stripe invoice. */
export function meterAutoInvoiced(
  plan: PlanId,
  meterId: string,
  contract?: ContractBilling | null,
): boolean {
  if (plan === "free") return false;
  if (plan === "pro") return true;
  return meterBillingMode(plan, meterId, contract) === "metered";
}

/** Per-cycle included quantity for a metered meter: contract override, else the meter's own. */
export function meteredIncluded(
  meterId: string,
  contract?: ContractBilling | null,
): number {
  const override = contract?.meteredAllowances[meterId];
  if (override !== undefined) return override;
  return getMeter(meterId)?.includedQuantity ?? 0;
}

/**
 * The rate a metered meter's overage bills at, ready to price or freeze: the
 * contract's negotiated rate if it has one, else the published meter rate, with
 * the per-cycle included quantity folded in.
 */
export function meteredRate(
  meterId: string,
  contract?: ContractBilling | null,
): MeterRate | null {
  const meter = getMeter(meterId);
  if (!meter) return null;
  const override = contract?.meteredRates[meterId];
  return {
    unitAmountCents: override?.unit_amount_cents ?? meter.unitAmountCents,
    per: override?.per ?? meter.per,
    includedQuantity: meteredIncluded(meterId, contract),
  };
}

const MS_PER_DAY = 86_400_000;

/**
 * Tolerance before consumption is called ahead or behind. Traffic is lumpy;
 * a band this wide keeps normal variance from reading as a problem, which is
 * what would make the signal worth ignoring.
 */
const PACE_TOLERANCE = 0.1;

/**
 * How much of the term must have passed before a projection is offered.
 *
 * A week into a year-long agreement, dividing by the elapsed fraction
 * multiplies that week by ~52, so one busy launch day projects a catastrophic
 * overrun. Below this threshold there is no pace, which is more useful than a
 * confident wrong one.
 */
const MIN_ELAPSED_FOR_PACE = 0.1;

/** Parse an ISO day (YYYY-MM-DD) as midnight UTC. */
export function parseIsoDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Inclusive day count between two ISO days; at least 1 for a valid term. */
export function termDays(term: ContractTerm): number {
  const from = parseIsoDay(term.start).getTime();
  const to = parseIsoDay(term.end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

/**
 * Days of the term consumed as of `now`, clamped to the term. A term that has
 * not started reads 0; one that has ended reads its full length, so a finished
 * agreement stops moving instead of projecting past its own end.
 */
export function daysElapsed(term: ContractTerm, now: Date): number {
  const total = termDays(term);
  if (!total) return 0;
  const from = parseIsoDay(term.start).getTime();
  const today = startOfDayUTC(now).getTime();
  const elapsed = Math.round((today - from) / MS_PER_DAY) + 1;
  return Math.min(Math.max(elapsed, 0), total);
}

/** The term as a period window, for querying usage across the whole agreement. */
export function termWindow(term: ContractTerm): PeriodWindow {
  return { from: parseIsoDay(term.start), to: parseIsoDay(term.end) };
}

/**
 * One meter's envelope.
 *
 * A meter with no contracted volume is reported with `contracted: null` rather
 * than 0: the agreement is silent about it, which is a different statement from
 * "you agreed to zero" and must not render as an instant 100% breach.
 */
export function envelopeFor(input: {
  meter: string;
  contracted: number | null;
  used: number;
  elapsedFraction: number;
}): ContractEnvelope {
  const meter = getMeter(input.meter);
  const used = Math.max(input.used, 0);
  const base = {
    meter: input.meter,
    label: meter?.label ?? input.meter,
    unit: meter?.unit ?? "units",
    used,
  };

  if (input.contracted === null || input.contracted <= 0) {
    return {
      ...base,
      contracted: null,
      remaining: null,
      usedPercent: null,
      projected: null,
      pace: null,
    };
  }

  const contracted = input.contracted;
  const elapsed = Math.min(Math.max(input.elapsedFraction, 0), 1);
  const projected =
    elapsed >= MIN_ELAPSED_FOR_PACE ? Math.round(used / elapsed) : null;

  let pace: ContractPace | null = null;
  if (projected !== null) {
    if (projected > contracted * (1 + PACE_TOLERANCE)) pace = "over";
    else if (projected < contracted * (1 - PACE_TOLERANCE)) pace = "under";
    else pace = "on";
  }

  return {
    ...base,
    contracted,
    remaining: Math.max(contracted - used, 0),
    // Uncapped: consumption past the envelope is a true-up to coordinate, not
    // a wall, so the number keeps counting past 100% instead of pinning there.
    usedPercent: (used / contracted) * 100,
    projected,
    pace,
  };
}

/**
 * The full contracted picture: the term, how far through it we are, and one
 * envelope per meter.
 *
 * Every meter that has EITHER a contracted volume or recorded usage gets a row.
 * Usage on a meter the agreement never mentioned is exactly the thing a
 * contract review needs to surface, so it must not be silently dropped.
 */
export function contractStatus(input: {
  term: ContractTerm;
  meterAllowances: Record<string, number>;
  used: Map<string, number> | Record<string, number>;
  now: Date;
}): ContractStatus {
  const total = termDays(input.term);
  const elapsed = daysElapsed(input.term, input.now);
  const elapsedFraction = total > 0 ? elapsed / total : 0;

  const used =
    input.used instanceof Map
      ? input.used
      : new Map(Object.entries(input.used));

  const meters = new Set<string>([
    ...Object.keys(input.meterAllowances),
    ...used.keys(),
  ]);

  const envelopes = [...meters]
    .map((meter) =>
      envelopeFor({
        meter,
        contracted: input.meterAllowances[meter] ?? null,
        used: used.get(meter) ?? 0,
        elapsedFraction,
      }),
    )
    // Contracted meters first, then by consumption: what was agreed leads, and
    // an unmentioned meter burning traffic sorts to the top of what is left.
    .sort((a, b) => {
      if ((a.contracted === null) !== (b.contracted === null)) {
        return a.contracted === null ? 1 : -1;
      }
      return b.used - a.used || a.meter.localeCompare(b.meter);
    });

  return {
    term: input.term,
    daysTotal: total,
    daysElapsed: elapsed,
    elapsedPercent: elapsedFraction * 100,
    envelopes,
  };
}

/** "Jan 1, 2026 - Dec 31, 2026" - the term, in words. */
const termFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatTerm(term: ContractTerm): string {
  return `${termFormat.format(parseIsoDay(term.start))} - ${termFormat.format(
    parseIsoDay(term.end),
  )}`;
}

/** How the pace reads in the console, in words a customer can act on. */
export const PACE_COPY: Record<ContractPace, string> = {
  under: "Tracking under estimate",
  on: "Tracking to estimate",
  over: "Tracking over estimate",
};
