import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Billing against a REAL Stripe sandbox.
 *
 * Opt-in, because it creates objects in a live (test-mode) Stripe account and
 * needs network: run with STRIPE_SANDBOX_TESTS=1. Everything it creates is
 * cleaned up, and it refuses to run against a live key.
 *
 * These are the parts that unit tests cannot honestly cover: whether Stripe
 * accepts the invoice items we build, whether the amounts land as intended,
 * and whether a redelivered webhook can double-bill. The rest of the billing
 * logic is pure and tested in meters.test.ts.
 */
const key = process.env.STRIPE_SECRET_KEY;
const enabled = Boolean(process.env.STRIPE_SANDBOX_TESTS) && Boolean(key);

// A live key here would create real charges. Never run against one.
if (enabled && !key?.startsWith("sk_test_")) {
  throw new Error(
    "Refusing to run sandbox tests against a non-test Stripe key.",
  );
}

describe.skipIf(!enabled)("stripe sandbox", () => {
  let stripe: import("stripe").default;
  let customerId = "";
  const created: string[] = [];

  beforeAll(async () => {
    const { getStripe } = await import("./billing");
    stripe = getStripe();
    const customer = await stripe.customers.create({
      name: "Flagon sandbox test",
      metadata: { flagon_test: "1" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    for (const id of created) {
      await stripe.invoices.del(id).catch(() => {});
    }
    if (customerId) await stripe.customers.del(customerId).catch(() => {});
  });

  it("resolves a Pro price without any manual dashboard setup", async () => {
    const { ensureProPriceId } = await import("./billing");
    const priceId = await ensureProPriceId();
    expect(priceId).toMatch(/^price_/);

    const price = await stripe.prices.retrieve(priceId);
    // The plan's advertised price and what Stripe would actually charge must
    // be the same number, or the pricing page is lying.
    const { PLANS } = await import("./plans");
    expect(price.unit_amount).toBe((PLANS.pro.priceMonthly as number) * 100);
    expect(price.currency).toBe("usd");
    expect(price.recurring?.interval).toBe("month");
  });

  it("attaches usage as invoice items that total the overage", async () => {
    const { addUsageToInvoice } = await import("./billing");
    const { buildUsageInvoiceLines, invoiceLinesTotalCents } =
      await import("./usage-invoice");
    const { applyIncludedCredit, getMeter, lineFromMeter } =
      await import("./meters");

    const meter = getMeter("flags.evaluations")!;
    // 50M events at $1.00/1M = $50.00, against Pro's $20 credit -> $30 due.
    const totals = applyIncludedCredit(
      [lineFromMeter(meter, 50_000_000)],
      2000,
    );
    expect(totals.usageCents).toBe(5000);
    expect(totals.overageCents).toBe(3000);

    const lines = buildUsageInvoiceLines(totals, {
      planName: "Pro",
      period: { from: "2026-07-01", to: "2026-07-31" },
    });
    expect(invoiceLinesTotalCents(lines)).toBe(totals.overageCents);

    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
    });
    created.push(invoice.id as string);

    const added = await addUsageToInvoice({
      invoiceId: invoice.id as string,
      customerId,
      lines,
    });
    expect(added).toBe(lines.length);

    // What Stripe actually holds, not what we hoped it would.
    const fresh = await stripe.invoices.retrieve(invoice.id as string);
    expect(fresh.total).toBe(totals.overageCents);

    const items = await stripe.invoiceItems.list({
      invoice: invoice.id as string,
      limit: 100,
    });
    expect(items.data.length).toBe(lines.length);
    // The credit rides as a NEGATIVE line, so the arithmetic stays visible on
    // the customer's invoice rather than hiding inside a coupon.
    expect(items.data.some((item) => item.amount < 0)).toBe(true);
  });

  it("cannot double-bill a redelivered webhook", async () => {
    const { addUsageToInvoice } = await import("./billing");
    const lines = [
      {
        key: "usage:flags.evaluations:2026-08-01",
        description: "Flag evaluations",
        amountCents: 1234,
      },
    ];

    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
    });
    created.push(invoice.id as string);

    expect(
      await addUsageToInvoice({
        invoiceId: invoice.id as string,
        customerId,
        lines,
      }),
    ).toBe(1);
    // Same call again: the line key is already present, so nothing is added.
    // This is the guarantee that makes an at-least-once webhook safe.
    expect(
      await addUsageToInvoice({
        invoiceId: invoice.id as string,
        customerId,
        lines,
      }),
    ).toBe(0);

    const fresh = await stripe.invoices.retrieve(invoice.id as string);
    expect(fresh.total).toBe(1234);
  });

  it("bills a period exactly once through the real webhook route", async () => {
    // The one seam unit tests cannot reach: signature verification, period
    // close, claim, and invoice-item creation wired together as the route
    // actually runs them.
    const secret = "whsec_route_test_secret";
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    const postgres = (await import("postgres")).default;
    const owner = postgres(process.env.DATABASE_URL_OWNER as string, {
      max: 1,
    });
    const slug = `wh-${Date.now()}`;
    let orgId = "";

    try {
      const [org] = await owner`
        INSERT INTO organizations (slug, name, plan, stripe_customer_id)
        VALUES (${slug}, 'Webhook Org', 'pro', ${customerId})
        RETURNING id`;
      orgId = org.id as string;

      // Usage in the cycle that just ended, which is what an invoice opening
      // now should carry (billed in arrears).
      const cycleStart = new Date("2026-06-01T00:00:00Z");
      await owner`
        INSERT INTO usage_rollups (organization_id, meter, day, quantity)
        VALUES (${orgId}::uuid, 'flags.evaluations', '2026-05-10'::date, 50000000)`;

      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: false,
      });
      created.push(invoice.id as string);

      const payload = JSON.stringify({
        id: "evt_route_test",
        type: "invoice.created",
        data: {
          object: {
            id: invoice.id,
            customer: customerId,
            status: "draft",
            period_start: Math.floor(cycleStart.getTime() / 1000),
          },
        },
      });
      const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret,
      });
      const { POST } = await import("@/app/api/webhooks/stripe/route");

      const deliver = () =>
        POST(
          new Request("https://api.flagon.io/api/webhooks/stripe", {
            method: "POST",
            headers: {
              "stripe-signature": header,
              "content-type": "application/json",
            },
            body: payload,
          }),
        );

      expect((await deliver()).status).toBe(200);

      // 50M events at $1.00/1M is $50.00; Pro's $20 credit absorbs what it
      // can, leaving $30.00 actually charged.
      const afterFirst = await stripe.invoices.retrieve(invoice.id as string);
      expect(afterFirst.total).toBe(3000);

      const [period] = await owner`
        SELECT status, stripe_invoice_id FROM billing_periods
        WHERE organization_id = ${orgId}::uuid`;
      expect(period.status).toBe("invoiced");
      expect(period.stripe_invoice_id).toBe(invoice.id);

      // Stripe delivers at least once. A redelivery must change nothing.
      expect((await deliver()).status).toBe(200);
      const afterRedelivery = await stripe.invoices.retrieve(
        invoice.id as string,
      );
      expect(afterRedelivery.total).toBe(3000);
    } finally {
      if (orgId)
        await owner`DELETE FROM organizations WHERE id = ${orgId}::uuid`;
      await owner.end();
      delete process.env.STRIPE_WEBHOOK_SECRET;
    }
  });

  it("verifies webhook signatures and rejects forgeries", async () => {
    const { getStripe } = await import("./billing");
    const secret = "whsec_sandbox_test_secret";
    const payload = JSON.stringify({ id: "evt_test", type: "invoice.created" });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const event = getStripe().webhooks.constructEvent(payload, header, secret);
    expect(event.type).toBe("invoice.created");

    // A tampered body must not verify, or the webhook is an open endpoint.
    expect(() =>
      getStripe().webhooks.constructEvent(
        JSON.stringify({ id: "evt_test", type: "invoice.paid" }),
        header,
        secret,
      ),
    ).toThrow();
  });
});
