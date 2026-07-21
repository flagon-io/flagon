import { describe, it, expect } from "vitest";
import {
  coversUsage,
  describeDiscount,
  discountedTotal,
  durationLabelFor,
  type Discount,
} from "./discounts";

function discount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: "di_test",
    label: "Promo",
    percentOff: null,
    amountOffCents: null,
    currency: "usd",
    scope: "all",
    endsAt: null,
    durationLabel: "",
    ...overrides,
  };
}

const PERIOD = { subscriptionCents: 2000, usageCents: 6000 };

describe("discounted totals", () => {
  it("is the identity when there is no discount", () => {
    expect(discountedTotal(PERIOD, null)).toEqual({
      discountCents: 0,
      totalCents: 8000,
    });
  });

  it("keeps a subscription-scoped discount off metered usage", () => {
    // THE case that decides whether we can safely issue percentage promos.
    // addUsageToInvoice attaches overage to the same invoice the coupon lands
    // on, so a discount that leaked past the subscription would quietly halve
    // a customer's usage bill at whatever volume they eventually reach.
    const result = discountedTotal(
      PERIOD,
      discount({ percentOff: 50, scope: "subscription" }),
    );

    // 50% of the $20 subscription only; the $60 of usage is untouched.
    expect(result.discountCents).toBe(1000);
    expect(result.totalCents).toBe(7000);
  });

  it("applies an unrestricted discount to usage as well", () => {
    // Equally deliberate: "100% off for three months" has to mean everything,
    // or someone promised a free quarter still gets an overage invoice.
    const result = discountedTotal(
      PERIOD,
      discount({ percentOff: 100, scope: "all" }),
    );

    expect(result.discountCents).toBe(8000);
    expect(result.totalCents).toBe(0);
  });

  it("takes a fixed amount off, capped at what is owed", () => {
    const result = discountedTotal(
      { subscriptionCents: 2000, usageCents: 0 },
      discount({ amountOffCents: 2000, scope: "subscription" }),
    );
    expect(result.totalCents).toBe(0);
  });

  it("never turns a discount into a credit", () => {
    // A $50 coupon against a $20 subscription zeroes the bill; it does not
    // hand back $30, and it must not make the total go negative.
    const result = discountedTotal(
      { subscriptionCents: 2000, usageCents: 0 },
      discount({ amountOffCents: 5000, scope: "subscription" }),
    );

    expect(result.discountCents).toBe(2000);
    expect(result.totalCents).toBe(0);
  });

  it("does not let a subscription-scoped coupon eat into usage", () => {
    // $50 off a $20 subscription with $60 of usage still leaves the $60.
    const result = discountedTotal(
      PERIOD,
      discount({ amountOffCents: 5000, scope: "subscription" }),
    );

    expect(result.discountCents).toBe(2000);
    expect(result.totalCents).toBe(6000);
  });

  it("rounds percentages the way Stripe does", () => {
    // Half a cent rounds up, matching the invoice rather than drifting a cent
    // below it on every account with an odd subtotal.
    const result = discountedTotal(
      { subscriptionCents: 333, usageCents: 0 },
      discount({ percentOff: 50, scope: "subscription" }),
    );
    expect(result.discountCents).toBe(167);
  });

  it("treats negative inputs as zero rather than inventing money", () => {
    const result = discountedTotal(
      { subscriptionCents: -500, usageCents: 100 },
      null,
    );
    expect(result.totalCents).toBe(100);
  });
});

describe("scope reporting", () => {
  it("says whether a discount reaches usage", () => {
    expect(coversUsage(discount({ scope: "all" }))).toBe(true);
    expect(coversUsage(discount({ scope: "subscription" }))).toBe(false);
    expect(coversUsage(null)).toBe(false);
  });
});

describe("labels", () => {
  it("describes what a coupon does when it has no name", () => {
    expect(
      describeDiscount({
        percentOff: 50,
        amountOffCents: null,
        currency: "usd",
      }),
    ).toBe("50% off");
    expect(
      describeDiscount({
        percentOff: 33.333,
        amountOffCents: null,
        currency: "usd",
      }),
    ).toBe("33.33% off");
    expect(
      describeDiscount({
        percentOff: null,
        amountOffCents: 2000,
        currency: "usd",
      }),
    ).toBe("$20 off");
  });

  it("spells out duration, so a trial discount can't read as permanent", () => {
    expect(durationLabelFor("repeating", 3)).toBe("for 3 months");
    expect(durationLabelFor("repeating", 1)).toBe("for 1 month");
    expect(durationLabelFor("once", null)).toBe("once");
    expect(durationLabelFor("forever", null)).toBe("forever");
    // Repeating with no month count is malformed; say nothing rather than
    // asserting a duration that isn't there.
    expect(durationLabelFor("repeating", null)).toBe("");
  });
});
