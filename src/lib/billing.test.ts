import { describe, it, expect } from "vitest";
import { billingEnabled, isTestModeKey } from "./billing";
import { PLAN_IDS, usageIsAutoInvoiced } from "./plans";

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
