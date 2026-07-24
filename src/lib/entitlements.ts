import { getMeter, type MeterRate } from "./meters";
import { PLANS, type PlanId } from "./plans";

/**
 * What an organization is actually entitled to, resolved.
 *
 * PURE DATA MATH, importable from client components, so the usage page, the
 * quota check, the invoice builder and the operator console all quote the same
 * numbers from the same function. Database reads live in entitlements.server.ts.
 *
 * TWO LAYERS, the version overriding the plan:
 *
 *   1. PLANS[plan]      The published default. What the pricing page advertises
 *                       and what a self-serve org gets. Never mutated per
 *                       customer - the marketing page reads these constants.
 *
 *   2. plan_versions    The price VERSION the org is on (drizzle/0037). Carries
 *                       the credit and allowances that price bought, so an org
 *                       kept on last year's pricing keeps last year's
 *                       entitlements when the list price moves. This is what
 *                       makes grandfathering automatic rather than a migration,
 *                       and it is the row the operator console edits to tune a
 *                       plan.
 *
 * The version merges PER FIELD and PER METER over the plan default: a version
 * that raises the sync allowance does not discard the evaluation allowance.
 */

/** The meter the evaluation ceiling is expressed against. */
export const EVALUATION_METER = "flags.evaluations";

/** Rate override shape, matching the jsonb written by the operator console. */
export type RateOverride = { unit_amount_cents: number; per: number };

/**
 * A plan version's entitlement half (drizzle/0037). The marketing copy and the
 * amount are not here: this type answers what a plan INCLUDES, not what it
 * costs or how it is sold.
 *
 * `unavailableMeters` is carried separately from allowances because "the plan
 * does not offer this product" and "the plan includes zero of it" are different
 * answers - the second bills from the first unit, the first must not bill at all.
 */
export type PriceEntitlements = {
  includedCreditCents: number;
  meterAllowances: Record<string, number>;
  hardCaps: Record<string, number>;
  /** Per-plan rate overrides, keyed by meter. Absent = the published rate. */
  meterRates?: Record<string, RateOverride>;
  /** Meters this plan does not offer at all. */
  unavailableMeters?: string[];
  /** False for an unbilled tier: no credit, ceilings instead. */
  billable?: boolean;
};

/**
 * Where a resolved number came from. Carried so the operator console can show
 * an allowance as a plan default versus a value the current version sets.
 */
export type EntitlementSource = "plan" | "price";

export type Entitlements = {
  plan: PlanId;
  includedCreditCents: number;
  creditSource: EntitlementSource;
  /** Per-meter units before PRICING starts. */
  meterAllowances: Record<string, number>;
  /** Per-meter overage rate; absent = the published rate. */
  meteredRates: Record<string, RateOverride>;
  /**
   * Per-meter consumption ceilings. An empty object means nothing is capped;
   * only an unbilled tier caps anything by default.
   */
  hardCaps: Record<string, number>;
  /** Which layer supplied each meter's allowance, keyed by meter id. */
  allowanceSources: Record<string, EntitlementSource>;
  /** Meters this org's plan does not offer at all. */
  unavailableMeters: string[];
  /**
   * Whether this org is billed at all. False for an unbilled tier, where usage
   * is governed by ceilings rather than by a credit against an invoice.
   */
  billable: boolean;
  /** The plan version row this resolved through, when there is one. */
  priceId: string | null;
  note: string | null;
};

/**
 * Resolve the layers into one answer.
 *
 * Deliberately takes plain data rather than reading anything: the console needs
 * to resolve a HYPOTHETICAL ("what would this customer get if I moved them to
 * this price?") without writing it first, and a function that queried could not
 * answer that.
 */
export function resolveEntitlements(input: {
  plan: PlanId;
  price?: (PriceEntitlements & { id?: string | null }) | null;
}): Entitlements {
  const plan = PLANS[input.plan];
  const price = input.price ?? null;

  // --- Credit -------------------------------------------------------------
  let includedCreditCents: number = plan.includedUsageCents;
  let creditSource: EntitlementSource = "plan";
  if (price) {
    includedCreditCents = price.includedCreditCents;
    creditSource = "price";
  }

  // --- Per-meter allowances ------------------------------------------------
  const meterAllowances: Record<string, number> = {};
  const allowanceSources: Record<string, EntitlementSource> = {};

  for (const [meter, units] of Object.entries(
    plan.meterAllowances as Record<string, number>,
  )) {
    meterAllowances[meter] = units;
    allowanceSources[meter] = "plan";
  }
  // A price with no allowances at all inherits the plan's rather than zeroing
  // them: an empty jsonb is "unspecified", not "nothing included".
  if (price) {
    for (const [meter, units] of Object.entries(price.meterAllowances)) {
      meterAllowances[meter] = units;
      allowanceSources[meter] = "price";
    }
  }

  // --- Hard caps -----------------------------------------------------------
  // The plan default applies unless the version declares its own set.
  let hardCaps: Record<string, number> = {
    ...(plan.hardCaps as Record<string, number>),
  };
  if (price) hardCaps = { ...price.hardCaps };

  // A version may re-price a meter for everyone on that plan.
  const meteredRates: Record<string, RateOverride> = {
    ...(price?.meterRates ?? {}),
  };

  return {
    plan: input.plan,
    includedCreditCents,
    creditSource,
    meterAllowances,
    meteredRates,
    hardCaps,
    allowanceSources,
    unavailableMeters: [...(price?.unavailableMeters ?? [])],
    // Defaults to true so a caller with no price row behaves as before; only a
    // version that declares itself unbilled turns it off.
    billable: price?.billable ?? true,
    priceId: price?.id ?? null,
    note: null,
  };
}

/** The entitlements a plan grants with no price row and no override. */
export function planDefaults(plan: PlanId): Entitlements {
  return resolveEntitlements({ plan });
}

/**
 * Units of a meter included before PRICING starts, falling back to the meter's
 * own included quantity. The entitlement-aware counterpart of quota.ts's
 * pricingAllowance.
 */
export function allowanceForMeter(
  entitlements: Entitlements,
  meterId: string,
): number {
  const declared = entitlements.meterAllowances[meterId];
  return declared ?? getMeter(meterId)?.includedQuantity ?? 0;
}

/**
 * A meter's rate as it applies to THIS ORG: the negotiated per-unit price if
 * the org has one, else the published rate, with its resolved included quantity
 * folded in.
 *
 * This is the rate that gets FROZEN onto a closed period, which is what stops a
 * later renegotiation from re-pricing a bill that already went out.
 */
export function rateForMeter(
  entitlements: Entitlements,
  meterId: string,
): MeterRate | null {
  const meter = getMeter(meterId);
  if (!meter) return null;
  const override = entitlements.meteredRates[meterId];
  return {
    unitAmountCents: override?.unit_amount_cents ?? meter.unitAmountCents,
    per: override?.per ?? meter.per,
    includedQuantity: allowanceForMeter(entitlements, meterId),
  };
}

/**
 * Units of a meter this org may consume before requests are REFUSED, or null
 * when uncapped.
 *
 * flags.evaluations is DERIVED from the credit rather than declared, so
 * re-pricing the meter or re-sizing the credit moves the cap with it and the
 * enforced number can never drift from the advertised one. That derivation now
 * runs on the org's RESOLVED credit, which means a custom-priced org's cap
 * tracks what they actually bought: a $100 Hobby-style trial with $100 of
 * credit is capped at what $100 buys, not at what the plan constant says.
 *
 * A plan that caps nothing stays uncapped: past the allowance it bills, it does
 * not refuse. Cutting off a paying customer mid-incident to protect a credit
 * would be a far worse outcome than the overage it prevents.
 */
export function capForMeter(
  entitlements: Entitlements,
  meterId: string,
): number | null {
  // A meter the plan does not offer is refused outright rather than billed.
  // Zero, not null: null would mean "uncapped", which is the opposite.
  if (entitlements.unavailableMeters.includes(meterId)) return 0;

  const declared = entitlements.hardCaps[meterId];
  if (declared !== undefined) return declared;

  // Legacy derivation, for the pre-0037 path only.
  //
  // Ceilings used to be computed from the plan's credit at the published rate,
  // so that re-pricing a meter moved the cap with it. Since plan versions
  // became data (drizzle/0037) they are DECLARED on the row instead - the
  // pricing page and the enforcement path read the same field, so the honesty
  // that derivation bought is now structural, and a ceiling is one number an
  // operator can edit rather than an arithmetic consequence they have to
  // reverse-engineer. This branch survives only for a database that has not run
  // the migration; once a plan version row exists, hardCaps is always set.
  if (meterId === EVALUATION_METER && capsAnything(entitlements)) {
    const meter = getMeter(meterId);
    if (meter) return allowanceFrom(meter, entitlements.includedCreditCents);
  }
  return null;
}

/**
 * Whether this org is hard-capped at all. Read off the RESOLVED caps rather
 * than the plan id, so an override that explicitly empties hardCaps lifts the
 * derived evaluation cap too - otherwise "uncap this trial" would leave the one
 * cap that is derived rather than declared silently in force.
 */
export function capsAnything(entitlements: Entitlements): boolean {
  return Object.keys(entitlements.hardCaps).length > 0;
}

/**
 * Units a credit buys at a rate, including the rate's own free allowance.
 *
 * Floored: a partial unit is not an entitlement. A rate that charges nothing
 * (or is malformed) buys nothing beyond the included quantity rather than
 * infinity, so a pricing typo fails toward the cap instead of removing it.
 */
export function allowanceFrom(rate: MeterRate, creditCents: number): number {
  if (rate.unitAmountCents <= 0 || rate.per <= 0 || creditCents <= 0) {
    return rate.includedQuantity;
  }
  return (
    rate.includedQuantity +
    Math.floor((creditCents / rate.unitAmountCents) * rate.per)
  );
}

