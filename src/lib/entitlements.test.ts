import { describe, it, expect } from "vitest";
import {
  EVALUATION_METER,
  allowanceForMeter,
  capForMeter,
  hasCustomTerms,
  planDefaults,
  rateForMeter,
  resolveEntitlements,
  type EntitlementOverride,
  type PriceEntitlements,
} from "./entitlements";
import { PLANS } from "./plans";

const SYNC_METER = "flags.syncs";

/** A price version, defaulting to something Pro-shaped. */
function price(over: Partial<PriceEntitlements> = {}): PriceEntitlements {
  return {
    includedCreditCents: 2000,
    meterAllowances: { [SYNC_METER]: 50_000_000 },
    hardCaps: {},
    ...over,
  };
}

/** An override that inherits everything unless told otherwise. */
function override(
  over: Partial<EntitlementOverride> = {},
): EntitlementOverride {
  return {
    includedCreditCents: null,
    meterAllowances: {},
    meteredRates: {},
    hardCaps: null,
    note: null,
    ...over,
  };
}

describe("resolveEntitlements", () => {
  it("falls back to the plan when there is no price and no override", () => {
    const resolved = resolveEntitlements({ plan: "pro" });
    expect(resolved.includedCreditCents).toBe(PLANS.pro.includedUsageCents);
    expect(resolved.creditSource).toBe("plan");
    expect(resolved.meterAllowances[SYNC_METER]).toBe(50_000_000);
    expect(resolved.allowanceSources[SYNC_METER]).toBe("plan");
  });

  it("takes the credit from the price version when the org is on one", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({ includedCreditCents: 2500 }),
    });
    expect(resolved.includedCreditCents).toBe(2500);
    expect(resolved.creditSource).toBe("price");
  });

  /**
   * The bug this whole system exists to fix: a customer negotiated onto $100/mo
   * Pro used to receive the plan constant's $20, because nothing per-org could
   * say otherwise.
   */
  it("gives a custom-priced org the credit it was actually sold", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price(),
      override: override({ includedCreditCents: 10_000 }),
    });
    expect(resolved.includedCreditCents).toBe(10_000);
    expect(resolved.creditSource).toBe("override");
    expect(hasCustomTerms(resolved)).toBe(true);
  });

  /**
   * Zero is a real, sellable configuration ("you pay, and every unit is
   * billable"). A truthiness check here would silently restore the plan's
   * credit on exactly the deal that removed it.
   */
  it("treats an override credit of 0 as real, not as absent", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price(),
      override: override({ includedCreditCents: 0 }),
    });
    expect(resolved.includedCreditCents).toBe(0);
    expect(resolved.creditSource).toBe("override");
  });

  it("merges allowances per meter so a partial override keeps the rest", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({
        meterAllowances: {
          [SYNC_METER]: 50_000_000,
          [EVALUATION_METER]: 1_000_000,
        },
      }),
      override: override({ meterAllowances: { [SYNC_METER]: 200_000_000 } }),
    });
    expect(resolved.meterAllowances[SYNC_METER]).toBe(200_000_000);
    expect(resolved.allowanceSources[SYNC_METER]).toBe("override");
    // Untouched by the override, so it still resolves from the price.
    expect(resolved.meterAllowances[EVALUATION_METER]).toBe(1_000_000);
    expect(resolved.allowanceSources[EVALUATION_METER]).toBe("price");
  });

  it("does not treat a price with no allowances as zeroing the plan's", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({ meterAllowances: {} }),
    });
    expect(resolved.meterAllowances[SYNC_METER]).toBe(50_000_000);
    expect(resolved.allowanceSources[SYNC_METER]).toBe("plan");
  });

  it("reports standard terms as not custom", () => {
    expect(hasCustomTerms(resolveEntitlements({ plan: "pro" }))).toBe(false);
    expect(
      hasCustomTerms(resolveEntitlements({ plan: "pro", price: price() })),
    ).toBe(false);
  });
});

describe("caps", () => {
  it("derives Hobby's evaluation cap from its resolved credit", () => {
    const hobby = planDefaults("free");
    // $10.00 of credit at $1.00 per 1M = 10M evaluations.
    expect(capForMeter(hobby, EVALUATION_METER)).toBe(10_000_000);
    expect(capForMeter(hobby, SYNC_METER)).toBe(5_000_000);
  });

  /**
   * The derived cap must track what the customer actually bought, not what
   * their plan's constant says - otherwise a trial given more credit would
   * still be refused at the list-price ceiling.
   */
  it("moves the derived cap with a negotiated credit", () => {
    const resolved = resolveEntitlements({
      plan: "free",
      override: override({ includedCreditCents: 5000 }),
    });
    expect(capForMeter(resolved, EVALUATION_METER)).toBe(50_000_000);
  });

  it("never caps a plan that bills instead of refusing", () => {
    const pro = planDefaults("pro");
    expect(capForMeter(pro, EVALUATION_METER)).toBeNull();
    expect(capForMeter(pro, SYNC_METER)).toBeNull();
    expect(capForMeter(planDefaults("enterprise"), EVALUATION_METER)).toBeNull();
  });

  /**
   * An explicit {} means EXPLICITLY UNCAPPED, which is different from null
   * (inherit). It has to lift the DERIVED evaluation cap too, or "uncap this
   * trial" would leave the one ceiling that is derived rather than declared
   * silently in force.
   */
  it("lifts every cap, including the derived one, when explicitly uncapped", () => {
    const resolved = resolveEntitlements({
      plan: "free",
      override: override({ hardCaps: {} }),
    });
    expect(capForMeter(resolved, SYNC_METER)).toBeNull();
    expect(capForMeter(resolved, EVALUATION_METER)).toBeNull();
  });

  it("inherits caps when the override leaves them null", () => {
    const resolved = resolveEntitlements({
      plan: "free",
      override: override({ includedCreditCents: 1000 }),
    });
    expect(capForMeter(resolved, SYNC_METER)).toBe(5_000_000);
  });
});

describe("rates", () => {
  it("uses the published rate with the resolved allowance folded in", () => {
    const resolved = resolveEntitlements({ plan: "pro", price: price() });
    const rate = rateForMeter(resolved, SYNC_METER);
    expect(rate).toEqual({
      unitAmountCents: 75,
      per: 1_000_000,
      includedQuantity: 50_000_000,
    });
  });

  it("honours a negotiated per-unit rate", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price(),
      override: override({
        meteredRates: {
          [EVALUATION_METER]: { unit_amount_cents: 50, per: 1_000_000 },
        },
      }),
    });
    expect(rateForMeter(resolved, EVALUATION_METER)?.unitAmountCents).toBe(50);
    // Untouched meters keep the published rate.
    expect(rateForMeter(resolved, SYNC_METER)?.unitAmountCents).toBe(75);
  });

  it("returns null for a meter the registry does not know", () => {
    expect(rateForMeter(planDefaults("pro"), "nope.nothing")).toBeNull();
  });

  /**
   * A plan may re-price a meter for everyone on it (drizzle/0037), and a deal
   * may re-price it again for one customer. The customer's number has to win,
   * or a negotiated rate would be silently overwritten by the list one.
   */
  it("layers a per-org rate over the plan's own rate", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({
        meterRates: {
          [EVALUATION_METER]: { unit_amount_cents: 25, per: 1_000_000 },
        },
      }),
    });
    expect(rateForMeter(resolved, EVALUATION_METER)?.unitAmountCents).toBe(25);

    const negotiated = resolveEntitlements({
      plan: "pro",
      price: price({
        meterRates: {
          [EVALUATION_METER]: { unit_amount_cents: 25, per: 1_000_000 },
        },
      }),
      override: override({
        meteredRates: {
          [EVALUATION_METER]: { unit_amount_cents: 10, per: 1_000_000 },
        },
      }),
    });
    expect(rateForMeter(negotiated, EVALUATION_METER)?.unitAmountCents).toBe(10);
  });
});

describe("unavailable meters", () => {
  /**
   * "The plan does not offer this" is not "the plan includes zero of it". Zero
   * bills from the first unit; unavailable must refuse instead, or a customer
   * gets billed for a product they were told they do not have.
   */
  it("refuses rather than bills a meter the plan does not offer", () => {
    const resolved = resolveEntitlements({
      plan: "free",
      price: price({
        includedCreditCents: 0,
        meterAllowances: {},
        unavailableMeters: [SYNC_METER],
      }),
    });
    expect(resolved.unavailableMeters).toContain(SYNC_METER);
    // Zero, not null: null means uncapped, which is the opposite of refusing.
    expect(capForMeter(resolved, SYNC_METER)).toBe(0);
  });
});

describe("unbilled tiers", () => {
  /**
   * An unbilled tier is governed by ceilings, not by a credit against an
   * invoice - modelling it as a $0 subscription with credit was the confusion
   * drizzle/0037 removed.
   */
  it("carries billable through resolution", () => {
    const free = resolveEntitlements({
      plan: "free",
      price: price({
        billable: false,
        includedCreditCents: 0,
        meterAllowances: { [SYNC_METER]: 5_000_000 },
        hardCaps: { [SYNC_METER]: 5_000_000, [EVALUATION_METER]: 10_000_000 },
      }),
    });
    expect(free.billable).toBe(false);
    expect(free.includedCreditCents).toBe(0);
    // Declared, not derived from a credit it does not have.
    expect(capForMeter(free, EVALUATION_METER)).toBe(10_000_000);
  });

  it("defaults to billable when nothing says otherwise", () => {
    expect(resolveEntitlements({ plan: "pro" }).billable).toBe(true);
  });

  it("falls back to the meter's own included quantity", () => {
    const resolved = resolveEntitlements({ plan: "enterprise" });
    expect(allowanceForMeter(resolved, EVALUATION_METER)).toBe(0);
  });
});
