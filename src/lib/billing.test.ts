import { describe, it, expect } from "vitest";
import { billingEnabled, isTestModeKey } from "./billing";
import { PLANS, PLAN_IDS, usageDisplay, usageIsAutoInvoiced } from "./plans";

describe("billing mode", () => {
  it("is off without a secret key (the self-host default)", () => {
    expect(billingEnabled({})).toBe(false);
    expect(billingEnabled({ STRIPE_SECRET_KEY: "sk_live_abc" })).toBe(true);
  });
});

describe("which plans get usage attached to an invoice", () => {
  it("is Pro alone", () => {
    expect(usageIsAutoInvoiced("pro")).toBe(true);
    // Hobby is never invoiced; Enterprise is contracted, and adding usage to
    // its invoice would charge the negotiated fee PLUS all metered usage.
    expect(usageIsAutoInvoiced("free")).toBe(false);
    expect(usageIsAutoInvoiced("enterprise")).toBe(false);
  });

  it("covers every plan that exists, so a new one has to opt in", () => {
    for (const plan of PLAN_IDS) {
      expect(typeof usageIsAutoInvoiced(plan)).toBe("boolean");
    }
  });
});

describe("how a plan's usage is presented", () => {
  it("gives each plan the frame that is true for it", () => {
    expect(usageDisplay("pro")).toBe("priced");
    expect(usageDisplay("free")).toBe("capped");
    expect(usageDisplay("enterprise")).toBe("contracted");
  });

  it("never prices a plan that has no price", () => {
    // The bug this predicate exists to make impossible: priceMonthly is null
    // on contract pricing, and the priced view rendered `?? 0` as a confident
    // "$0.00 subscription" line on the bill of the customer paying the most.
    for (const plan of PLAN_IDS) {
      if (PLANS[plan].priceMonthly === null) {
        expect(usageDisplay(plan), plan).not.toBe("priced");
      }
    }
  });

  it("covers every plan that exists, so a new one has to opt in", () => {
    for (const plan of PLAN_IDS) {
      expect(["priced", "capped", "contracted"]).toContain(usageDisplay(plan));
    }
  });

  it("shows money only where usage is actually invoiced", () => {
    // The two predicates have to agree: a plan whose usage lands on an invoice
    // must show the money, and one that shows money must be able to explain
    // where it goes.
    for (const plan of PLAN_IDS) {
      if (usageIsAutoInvoiced(plan)) {
        expect(usageDisplay(plan), plan).toBe("priced");
      }
    }
  });
});

describe("test-mode detection", () => {
  it("reads the KEY, not the environment", () => {
    expect(isTestModeKey("sk_test_abc")).toBe(true);
    expect(isTestModeKey("rk_test_abc")).toBe(true);
  });

  it("treats a live key as live, and anything unrecognized as live", () => {
    // Fails CLOSED: an unset or malformed key must not be mistaken for a
    // sandbox, because the only thing guarded by this is whether we are
    // willing to CREATE objects in the account.
    expect(isTestModeKey("sk_live_abc")).toBe(false);
    expect(isTestModeKey(undefined)).toBe(false);
    expect(isTestModeKey("")).toBe(false);
    expect(isTestModeKey("whsec_abc")).toBe(false);
  });
});
