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
import {
  meterBillingMode,
  meterAutoInvoiced,
  meteredIncluded,
  meteredRate,
  type ContractBilling,
} from "./contracts";

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
  it("is Pro and Enterprise, never Hobby", () => {
    expect(planAutoInvoicesAnything("pro")).toBe(true);
    // Enterprise now carries a real subscription: its metered meters (overage
    // outside the base contract) auto-bill, so the coarse gate lets it through.
    expect(planAutoInvoicesAnything("enterprise")).toBe(true);
    expect(planAutoInvoicesAnything("free")).toBe(false);
  });

  it("covers every plan that exists, so a new one has to opt in", () => {
    for (const plan of PLAN_IDS) {
      expect(typeof planAutoInvoicesAnything(plan)).toBe("boolean");
    }
  });
});

describe("per-meter billing mode (contracted orgs)", () => {
  const contract: ContractBilling = {
    // Feature Flags evaluations are covered by the base bill (a term envelope).
    meterAllowances: { "flags.evaluations": 750_000_000 },
    // Syncs are metered: 1M included per cycle, overage billed on top.
    meteredAllowances: { "flags.syncs": 1_000_000 },
    meteredRates: {},
  };

  it("is always priced for pro and free", () => {
    expect(meterBillingMode("pro", "flags.evaluations", contract)).toBe(
      "priced",
    );
    expect(meterBillingMode("free", "flags.syncs", null)).toBe("priced");
  });

  it("splits enterprise meters into covered and metered", () => {
    // Named in the contract envelope -> covered (volume, not billed).
    expect(meterBillingMode("enterprise", "flags.evaluations", contract)).toBe(
      "covered",
    );
    // Not in the envelope -> metered (auto-billed), even though it has a
    // per-cycle included allowance.
    expect(meterBillingMode("enterprise", "flags.syncs", contract)).toBe(
      "metered",
    );
    // A meter the contract never mentions is metered by default.
    expect(meterBillingMode("enterprise", "other.meter", contract)).toBe(
      "metered",
    );
  });

  it("auto-invoices only the metered meters for enterprise", () => {
    expect(meterAutoInvoiced("enterprise", "flags.evaluations", contract)).toBe(
      false,
    );
    expect(meterAutoInvoiced("enterprise", "flags.syncs", contract)).toBe(true);
    // Pro bills everything; free bills nothing.
    expect(meterAutoInvoiced("pro", "flags.evaluations", contract)).toBe(true);
    expect(meterAutoInvoiced("free", "flags.syncs", contract)).toBe(false);
  });

  it("resolves per-cycle included: contract override, else the meter default", () => {
    expect(meteredIncluded("flags.syncs", contract)).toBe(1_000_000);
    // flags.evaluations has meter includedQuantity 0 and no override here.
    expect(meteredIncluded("flags.evaluations", contract)).toBe(0);
  });

  it("resolves the metered rate: override wins, else the published rate", () => {
    const withOverride: ContractBilling = {
      ...contract,
      meteredRates: {
        "flags.syncs": { unit_amount_cents: 50, per: 1_000_000 },
      },
    };
    expect(meteredRate("flags.syncs", withOverride)).toEqual({
      unitAmountCents: 50,
      per: 1_000_000,
      includedQuantity: 1_000_000,
    });
    // No override: the published $0.75/1M rate, with the contract's per-cycle
    // included folded in.
    expect(meteredRate("flags.syncs", contract)).toEqual({
      unitAmountCents: 75,
      per: 1_000_000,
      includedQuantity: 1_000_000,
    });
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

  it("only a capped plan is never invoiced", () => {
    // The frames and the invoicing gate have to agree: a capped plan (Hobby)
    // never bills, while priced (Pro) and contracted (Enterprise, for its
    // metered meters) both do.
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
