import { getMeter, type MeterRate } from "./meters";
import { PLANS, type PlanId } from "./plans";

/**
 * What an organization is actually entitled to, resolved.
 *
 * PURE DATA MATH, importable from client components, so the usage page, the
 * quota check, the invoice builder and the operator console all quote the same
 * numbers from the same function. Database reads live in entitlements.server.ts.
 *
 * THE PROBLEM THIS SOLVES. Entitlements used to come from exactly one place -
 * the PLANS constants - which meant every org on a plan got identical terms.
 * That is correct for self-serve and wrong for everything else. A customer
 * negotiated onto $100/mo Pro received $20 of credit, because
 * PLANS.pro.includedUsageCents was the only answer available and nothing
 * per-org could override it. The money said one thing and the product did
 * another.
 *
 * FOUR LAYERS, each overriding the one above:
 *
 *   1. PLANS[plan]      The published default. What the pricing page advertises
 *                       and what a self-serve org gets. Never mutated per
 *                       customer - the marketing page reads these constants, so
 *                       moving one to close a deal would change what the site
 *                       claims Pro costs.
 *
 *   2. plan_prices      The price VERSION the org is on (drizzle/0035). Carries
 *                       the credit and allowances that price bought, so an org
 *                       kept on 2024 pricing keeps 2024's entitlements when the
 *                       list price moves. This is what makes grandfathering
 *                       automatic rather than a migration.
 *
 *   3. org_entitlements The negotiated override (drizzle/0036). Applies on ANY
 *                       plan, which is the whole point: custom Pro is a real
 *                       product now, not something only enterprise can have.
 *
 *   4. org_contracts    Enterprise only (drizzle/0030+0032). Decides per meter
 *                       whether usage is COVERED (term volume, never billed) or
 *                       METERED (billed per cycle). Layered separately in
 *                       contracts.ts because it answers a different question:
 *                       not "how much is included" but "is this billed at all".
 *
 * Every layer merges PER FIELD and PER METER. An override that sets only the
 * credit leaves allowances resolving from the price; an override that raises
 * the sync allowance does not discard the evaluation allowance. Partial
 * overrides are the common case - a deal usually moves one number - so making
 * them safe is what keeps this from becoming a footgun.
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
 * A per-org override row (drizzle/0036). Null/empty means INHERIT, at every
 * field, which is what makes a partial override safe.
 */
export type EntitlementOverride = {
  /** Null inherits. NOT the same as 0, which is a real "nothing included". */
  includedCreditCents: number | null;
  meterAllowances: Record<string, number>;
  meteredRates: Record<string, RateOverride>;
  /** Null inherits; an explicit {} means explicitly UNCAPPED. */
  hardCaps: Record<string, number> | null;
  note: string | null;
};

/**
 * Where a resolved number came from. Carried so the operator console can show
 * an allowance as inherited-from-Pro versus negotiated-for-this-customer, which
 * is the difference between an operator trusting the screen and second-guessing
 * it.
 */
export type EntitlementSource = "plan" | "price" | "override";

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
  override?: EntitlementOverride | null;
}): Entitlements {
  const plan = PLANS[input.plan];
  const price = input.price ?? null;
  const override = input.override ?? null;

  // --- Credit -------------------------------------------------------------
  // Widened deliberately: PLANS is `as const`, so this reads as the literal
  // union of today's three credits, and a negotiated override is by definition
  // a number that is not one of them.
  let includedCreditCents: number = plan.includedUsageCents;
  let creditSource: EntitlementSource = "plan";
  if (price) {
    includedCreditCents = price.includedCreditCents;
    creditSource = "price";
  }
  // `!= null` and not a truthiness check: 0 is a legitimate override meaning
  // "you pay, and every unit is billable". Treating it as absent would
  // silently restore the plan's credit on exactly the deal that removed it.
  if (override?.includedCreditCents != null) {
    includedCreditCents = override.includedCreditCents;
    creditSource = "override";
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
  if (override) {
    for (const [meter, units] of Object.entries(override.meterAllowances)) {
      meterAllowances[meter] = units;
      allowanceSources[meter] = "override";
    }
  }

  // --- Hard caps -----------------------------------------------------------
  // Null inherits; an explicit {} is EXPLICITLY UNCAPPED, which is how a trial
  // gets Hobby's limits lifted without being moved off Hobby. Because those two
  // are different answers, this cannot collapse to a merge.
  let hardCaps: Record<string, number> = {
    ...(plan.hardCaps as Record<string, number>),
  };
  if (price) hardCaps = { ...price.hardCaps };
  if (override?.hardCaps != null) hardCaps = { ...override.hardCaps };

  // Rates layer the same way: the plan version may re-price a meter for
  // everyone on that plan, and a negotiated override may re-price it again for
  // one customer.
  const meteredRates: Record<string, RateOverride> = {
    ...(price?.meterRates ?? {}),
    ...(override?.meteredRates ?? {}),
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
    note: override?.note ?? null,
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

/**
 * Whether an org's terms differ from what its plan publishes - i.e. whether
 * this is a negotiated customer. Drives the "custom terms" badge in the console
 * so an operator knows before they touch anything that this account is not
 * standard.
 */
export function hasCustomTerms(entitlements: Entitlements): boolean {
  if (entitlements.creditSource === "override") return true;
  return Object.values(entitlements.allowanceSources).includes("override");
}

/**
 * Coerce an allowance jsonb into a clean map. Shared by every reader so one
 * malformed entry written by hand can never take down a usage page.
 */
export function sanitizeAllowances(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, number> = {};
  for (const [meter, value] of Object.entries(raw as Record<string, unknown>)) {
    const quantity = Number(value);
    if (Number.isFinite(quantity) && quantity >= 0) clean[meter] = quantity;
  }
  return clean;
}

/** Coerce a rates jsonb; a malformed entry is dropped so it falls back to published. */
export function sanitizeRates(raw: unknown): Record<string, RateOverride> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, RateOverride> = {};
  for (const [meter, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const cents = Number((value as Record<string, unknown>).unit_amount_cents);
    const per = Number((value as Record<string, unknown>).per);
    if (Number.isFinite(cents) && cents >= 0 && Number.isFinite(per) && per > 0) {
      clean[meter] = { unit_amount_cents: cents, per };
    }
  }
  return clean;
}
