import { describe, it, expect } from "vitest";
import {
  EVALUATION_METER,
  allowanceForMeter,
  capForMeter,
  planDefaults,
  rateForMeter,
  resolveEntitlements,
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

describe("resolveEntitlements", () => {
  it("falls back to the plan when there is no price", () => {
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

  it("merges allowances per meter so a partial version keeps the rest", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({
        meterAllowances: {
          [SYNC_METER]: 200_000_000,
          [EVALUATION_METER]: 1_000_000,
        },
      }),
    });
    expect(resolved.meterAllowances[SYNC_METER]).toBe(200_000_000);
    expect(resolved.allowanceSources[SYNC_METER]).toBe("price");
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
});

describe("caps", () => {
  it("derives Hobby's evaluation cap from its resolved credit", () => {
    const hobby = planDefaults("free");
    // $10.00 of credit at $1.00 per 1M = 10M evaluations.
    expect(capForMeter(hobby, EVALUATION_METER)).toBe(10_000_000);
    expect(capForMeter(hobby, SYNC_METER)).toBe(5_000_000);
  });

  it("reads a version's declared evaluation cap", () => {
    const resolved = resolveEntitlements({
      plan: "free",
      price: price({
        hardCaps: { [EVALUATION_METER]: 50_000_000 },
      }),
    });
    expect(capForMeter(resolved, EVALUATION_METER)).toBe(50_000_000);
  });

  it("never caps a plan that bills instead of refusing", () => {
    const pro = planDefaults("pro");
    expect(capForMeter(pro, EVALUATION_METER)).toBeNull();
    expect(capForMeter(pro, SYNC_METER)).toBeNull();
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

  it("returns null for a meter the registry does not know", () => {
    expect(rateForMeter(planDefaults("pro"), "nope.nothing")).toBeNull();
  });

  /**
   * A version may re-price a meter for everyone on it (drizzle/0037). The
   * version's number has to win over the published one.
   */
  it("layers a version rate over the published rate", () => {
    const resolved = resolveEntitlements({
      plan: "pro",
      price: price({
        meterRates: {
          [EVALUATION_METER]: { unit_amount_cents: 25, per: 1_000_000 },
        },
      }),
    });
    expect(rateForMeter(resolved, EVALUATION_METER)?.unitAmountCents).toBe(25);
    // Untouched meters keep the published rate.
    expect(rateForMeter(resolved, SYNC_METER)?.unitAmountCents).toBe(75);
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
    const resolved = resolveEntitlements({ plan: "free" });
    expect(allowanceForMeter(resolved, EVALUATION_METER)).toBe(0);
  });
});
