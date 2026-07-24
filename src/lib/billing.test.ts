import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The Stripe SDK is mocked at the module boundary rather than by spying on
 * getStripe(): resolveStripePriceId calls it internally, and an ES module's
 * internal call cannot be intercepted through the namespace object. Mocking the
 * constructor is also what keeps this test off the network - the spy version
 * silently made a real API request.
 */
const priceList = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class {
    prices = { list: priceList };
  },
}));

import {
  billingEnabled,
  isTestModeKey,
  resolveStripePriceId,
} from "./billing";
import {
  PLANS,
  PLAN_IDS,
  usageDisplay,
  planAutoInvoicesAnything,
} from "./plans";

describe("billing mode", () => {
  it("is off without a secret key (the self-host default)", () => {
    expect(billingEnabled({})).toBe(false);
    expect(billingEnabled({ STRIPE_SECRET_KEY: "sk_live_abc" })).toBe(true);
  });
});

/**
 * Regression: a PRODUCT id configured where a price id belongs.
 *
 * Checkout takes `line_items[].price` and rejects a `prod_...` outright, so
 * this misconfiguration breaks every self-serve upgrade - and it surfaces on a
 * customer's click rather than at deploy, because product and price ids are
 * both opaque and sit next to each other in the Stripe dashboard.
 */
describe("resolving a configured Stripe id", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    priceList.mockReset();
  });

  it("passes a price id straight through, with no Stripe call", async () => {
    await expect(resolveStripePriceId("price_abc123")).resolves.toBe(
      "price_abc123",
    );
    // The correctly-configured path must cost nothing.
    expect(priceList).not.toHaveBeenCalled();
  });

  it("resolves a product id to its active recurring price", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    priceList.mockResolvedValue({ data: [{ id: "price_real" }] });

    await expect(resolveStripePriceId("prod_UvYZ")).resolves.toBe("price_real");
    expect(priceList).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "prod_UvYZ",
        active: true,
        type: "recurring",
      }),
    );
  });

  it("explains itself when the product has no recurring price to use", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    priceList.mockResolvedValue({ data: [] });

    await expect(resolveStripePriceId("prod_Empty")).rejects.toThrow(
      /is a PRODUCT, not a price/,
    );
  });
});

describe("which plans can auto-invoice usage", () => {
  it("is Pro, never Hobby", () => {
    expect(planAutoInvoicesAnything("pro")).toBe(true);
    expect(planAutoInvoicesAnything("free")).toBe(false);
  });

  it("covers every plan that exists, so a new one has to opt in", () => {
    for (const plan of PLAN_IDS) {
      expect(typeof planAutoInvoicesAnything(plan)).toBe("boolean");
    }
  });
});

describe("how a plan's usage is presented", () => {
  it("gives each plan the frame that is true for it", () => {
    expect(usageDisplay("pro")).toBe("priced");
    expect(usageDisplay("free")).toBe("capped");
  });

  it("prices only a plan that has a price", () => {
    // Hobby's $0 is not a subscription; it is capped, never priced.
    expect(usageDisplay("free")).toBe("capped");
    expect(PLANS.free.priceMonthly).toBe(0);
  });

  it("covers every plan that exists, so a new one has to opt in", () => {
    for (const plan of PLAN_IDS) {
      expect(["priced", "capped"]).toContain(usageDisplay(plan));
    }
  });

  it("only a capped plan is never invoiced", () => {
    // The frames and the invoicing gate have to agree: a capped plan (Hobby)
    // never bills, while priced (Pro) does.
    for (const plan of PLAN_IDS) {
      if (usageDisplay(plan) === "capped") {
        expect(planAutoInvoicesAnything(plan), plan).toBe(false);
      } else {
        expect(planAutoInvoicesAnything(plan), plan).toBe(true);
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
