import {
  calendarMonthPeriod,
  isoDay,
  type PeriodWindow,
} from "./billing-period";
import { getMeter, type MeterRate } from "./meters";
import { PLANS, type PlanId } from "./plans";

/**
 * Hard caps: what a plan is allowed to CONSUME, as opposed to what it is
 * charged (src/lib/meters.ts) or what it may CREATE (PLANS[...].limits).
 *
 * PURE DATA MATH, importable from client components, so the pricing page, the
 * usage page, and the enforcement path all quote the same number.
 *
 * Only Hobby is capped. Pro and Enterprise are usage-based by design: going
 * over produces a bill, never a refusal. Cutting off a paying customer
 * mid-incident to protect a $20 credit would be a far worse outcome than the
 * overage it prevents, and Enterprise contracts explicitly promise no hard
 * caps.
 */

/** The meter the evaluation cap is expressed against. */
export const EVALUATION_METER = "flags.evaluations";

/** Full configuration payloads served. A 304 revalidation is not one. */
export const SYNC_METER = "flags.syncs";

/**
 * Units of a meter a plan may consume before requests are REFUSED, or null
 * when the meter is not capped on that plan.
 *
 * Two different sources, deliberately:
 *
 *   flags.evaluations is DERIVED from the plan's usage credit, so re-pricing
 *   the meter moves the cap with it and the enforced number can never drift
 *   from the advertised one.
 *
 *   flags.syncs is DECLARED per plan, because it is a bandwidth guardrail
 *   rather than something the credit buys. Deriving it from credit would make
 *   the ceiling move when we re-priced evaluations, which is unrelated.
 *
 * Only Hobby is capped either way. Pro and Enterprise bill past their
 * allowance; they never refuse.
 */
export function hardCap(plan: PlanId, meterId: string): number | null {
  if (meterId === EVALUATION_METER) return evaluationAllowance(plan);
  const declared = (PLANS[plan].hardCaps as Record<string, number>)[meterId];
  return declared ?? null;
}

/**
 * Units of a meter a plan gets before PRICING starts.
 *
 * Falls back to the meter's own included quantity, so a meter with no
 * plan-level entry behaves exactly as it always has. This is the rate that
 * gets FROZEN onto a closed period's lines, which is what keeps a plan change
 * from re-pricing a bill that already went out.
 */
export function pricingAllowance(plan: PlanId, meterId: string): number {
  const declared = (PLANS[plan].meterAllowances as Record<string, number>)[
    meterId
  ];
  return declared ?? getMeter(meterId)?.includedQuantity ?? 0;
}

/** A meter's rate as it applies to one plan, ready to price or to freeze. */
export function planRate(plan: PlanId, meterId: string): MeterRate | null {
  const meter = getMeter(meterId);
  if (!meter) return null;
  return {
    unitAmountCents: meter.unitAmountCents,
    per: meter.per,
    includedQuantity: pricingAllowance(plan, meterId),
  };
}

/**
 * The evaluation allowance for a plan, or null when the plan is uncapped.
 *
 * DERIVED, not declared. Hobby's allowance is exactly what its included usage
 * credit buys at the meter's own published rate:
 *
 *   the meter's free allowance          0 evaluations
 *   + what $10.00 of credit buys      + 10,000,000 (1000c / 100c per 1M)
 *   -------------------------------------------------------------
 *   = 10,000,000 evaluations per month
 *
 * Deriving it is what keeps the cap honest: re-price the meter or re-size
 * Hobby's credit and the cap moves with it automatically, so the number we
 * enforce can never drift from the number the pricing page advertises. A
 * hand-written constant would silently keep enforcing last quarter's pricing.
 */
export function evaluationAllowance(plan: PlanId): number | null {
  if (plan !== "free") return null;
  const meter = getMeter(EVALUATION_METER);
  if (!meter) return null;
  return allowanceFor(meter, PLANS.free.includedUsageCents);
}

/**
 * Units a credit buys at a rate, including the rate's own free allowance.
 *
 * Floored: a partial unit is not an entitlement. A rate that charges nothing
 * (or is malformed) buys nothing beyond the included quantity rather than
 * infinity, so a pricing typo fails toward the cap instead of removing it.
 */
export function allowanceFor(rate: MeterRate, creditCents: number): number {
  if (rate.unitAmountCents <= 0 || rate.per <= 0 || creditCents <= 0) {
    return rate.includedQuantity;
  }
  return (
    rate.includedQuantity +
    Math.floor((creditCents / rate.unitAmountCents) * rate.per)
  );
}

/**
 * The key evaluation_counters is keyed by: the first day of the window the org
 * is currently accruing into (drizzle/0027).
 *
 * The org's OWN billing window, not the calendar month. An org on an
 * anniversary cycle would otherwise have its usage page and invoice running
 * the 19th to the 19th while its cap counted the 1st to the 1st, and two
 * different answers to "this period" in one product is precisely what
 * billing-period.ts exists to prevent. Still one date, so still one indexed
 * probe on the hot path.
 *
 * An org with no subscription has no cycle, so its window IS the calendar
 * month and this returns the first of it.
 */
export function counterPeriodStart(window: PeriodWindow): string {
  return isoDay(window.from);
}

/**
 * The counter key for an org with no subscription cycle: the calendar month.
 * For callers holding a moment rather than a window.
 */
export function counterMonth(at: Date = new Date()): string {
  return counterPeriodStart(calendarMonthPeriod(at));
}

/** Whether `used + quantity` would exceed a (possibly absent) allowance. */
export function exceedsAllowance(
  allowance: number | null,
  used: number,
  quantity: number,
): boolean {
  if (allowance === null) return false;
  return used + quantity > allowance;
}
