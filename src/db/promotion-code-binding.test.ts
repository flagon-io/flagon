import { describe, it, expect, afterAll, beforeAll } from "vitest";

/**
 * Per-customer (bound) promotion codes, against a real Stripe sandbox.
 *
 * sudo's `createPromotionCode` (sudo/src/lib/coupons.ts) gained two things: a
 * `customer` binding (a code only ONE customer can redeem) and `restrictions`
 * (first-purchase-only, minimum order). That wrapper is a thin, typechecked map
 * onto the Stripe params reproduced verbatim below - the part that can't be
 * proven by types is whether STRIPE actually enforces the binding at redemption.
 * This does: a code bound to customer A is rejected for customer B and accepted
 * for A, and the restrictions round-trip.
 *
 * Lives in flagon's harness because sudo has none; flagon and sudo share the one
 * Stripe account, so the sandbox key here mints and redeems against the same
 * objects sudo would. No test clock: binding is enforced at redemption time, not
 * on a cycle boundary.
 *
 * Opt-in (STRIPE_SANDBOX_TESTS=1); refuses a live key.
 */
const key = process.env.STRIPE_SECRET_KEY;
const enabled = Boolean(process.env.STRIPE_SANDBOX_TESTS && key);

if (enabled && !key?.startsWith("sk_test_")) {
  throw new Error("Refusing to run promotion-code rehearsal against a live key.");
}

/**
 * The EXACT params sudo/src/lib/coupons.ts builds for a bound, restricted code.
 * Kept identical on purpose: this test is the proof that shape does what the
 * feature claims, so it must not drift from the wrapper.
 */
function boundCodeParams(input: {
  couponId: string;
  customerId?: string;
  firstTime?: boolean;
  minimumAmountCents?: number;
}): import("stripe").default.PromotionCodeCreateParams {
  const params: import("stripe").default.PromotionCodeCreateParams = {
    promotion: { type: "coupon", coupon: input.couponId },
  };
  if (input.customerId) params.customer = input.customerId;
  const restrictions: import("stripe").default.PromotionCodeCreateParams.Restrictions =
    {};
  if (input.firstTime) restrictions.first_time_transaction = true;
  if (input.minimumAmountCents != null) {
    restrictions.minimum_amount = input.minimumAmountCents;
    restrictions.minimum_amount_currency = "usd";
  }
  if (Object.keys(restrictions).length > 0) params.restrictions = restrictions;
  return params;
}

describe.skipIf(!enabled)("promotion code customer binding", () => {
  let stripe: import("stripe").default;
  const created = {
    customers: [] as string[],
    coupons: [] as string[],
  };

  beforeAll(async () => {
    const { getStripe } = await import("@/lib/billing");
    stripe = getStripe();
  }, 60_000);

  afterAll(async () => {
    // Deleting a customer takes its subscriptions and invoices with it; coupons
    // are deleted directly. Promotion codes can't be deleted (only deactivated)
    // and are harmless once their customer/coupon is gone.
    for (const id of created.customers)
      await stripe.customers.del(id).catch(() => {});
    for (const id of created.coupons)
      await stripe.coupons.del(id).catch(() => {});
  }, 60_000);

  it("is redeemable only by the bound customer", async () => {
    const stamp = Date.now();
    const { ensureProPriceId } = await import("@/lib/billing");
    const priceId = await ensureProPriceId();

    const coupon = await stripe.coupons.create({
      percent_off: 25,
      duration: "once",
      name: `bind rehearsal ${stamp}`,
    });
    created.coupons.push(coupon.id);

    // send_invoice so neither subscription needs a card; both customers carry an
    // email so Stripe will open the invoice.
    const bound = await stripe.customers.create({
      name: `bound ${stamp}`,
      email: `bound-${stamp}@example.com`,
      metadata: { flagon_test: "1" },
    });
    const other = await stripe.customers.create({
      name: `other ${stamp}`,
      email: `other-${stamp}@example.com`,
      metadata: { flagon_test: "1" },
    });
    created.customers.push(bound.id, other.id);

    const code = await stripe.promotionCodes.create(
      boundCodeParams({ couponId: coupon.id, customerId: bound.id }),
    );
    expect(code.customer).toBe(bound.id);

    const subscribeWith = (customerId: string) =>
      stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        collection_method: "send_invoice",
        days_until_due: 30,
        discounts: [{ promotion_code: code.id }],
      });

    // The other customer cannot redeem it: Stripe rejects the code at use.
    await expect(subscribeWith(other.id)).rejects.toThrow();

    // The bound customer CAN redeem it (no throw), and Stripe records the
    // redemption against the code - the counter moving is proof the code was
    // actually consumed, not silently ignored.
    const okSub = await subscribeWith(bound.id);
    expect(okSub.id).toBeTruthy();
    const redeemed = await stripe.promotionCodes.retrieve(code.id);
    expect(redeemed.times_redeemed).toBeGreaterThan(0);
  }, 120_000);

  it("stores first-purchase and minimum-order restrictions", async () => {
    const stamp = Date.now();
    const coupon = await stripe.coupons.create({
      percent_off: 10,
      duration: "once",
      name: `restrict rehearsal ${stamp}`,
    });
    created.coupons.push(coupon.id);

    const code = await stripe.promotionCodes.create(
      boundCodeParams({
        couponId: coupon.id,
        firstTime: true,
        minimumAmountCents: 1500,
      }),
    );

    expect(code.restrictions?.first_time_transaction).toBe(true);
    expect(code.restrictions?.minimum_amount).toBe(1500);
    expect(code.restrictions?.minimum_amount_currency).toBe("usd");
    expect(code.customer).toBeNull();
  }, 120_000);
});
