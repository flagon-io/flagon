import { describe, it, expect, afterAll, beforeAll } from "vitest";
import postgres from "postgres";

/**
 * The money path, end to end, against a real Stripe test clock.
 *
 * billing-sandbox.test.ts proves `addUsageToInvoice` in isolation: the amounts
 * are right, the credit rides as a negative line, a repeat call does not
 * duplicate. What it cannot reach is everything AROUND that call, which is
 * where the expensive mistakes live:
 *
 *   - the ARREARS WINDOW. A recurring invoice's period is the range it is
 *     opening, so billing usage against it would charge an empty future month
 *     forever. Only a real `invoice.created` from Stripe carries a real
 *     period_start to test that against.
 *   - the org lookup by stripe_customer_id, and the plan guard on it.
 *   - closing the period, freezing the snapshot, and marking it invoiced
 *     exactly once across redelivery.
 *
 * A test clock is the only way to see an invoice open without waiting a month.
 * The clock is advanced to just past the first cycle's end, so Stripe opens
 * the second cycle's invoice while it is still a DRAFT - which is the state
 * the handler requires, and in production is a roughly one-hour window.
 *
 * Opt-in (STRIPE_SANDBOX_TESTS=1) because it creates objects in a Stripe
 * account and takes tens of seconds. Refuses to run against a live key.
 */
const key = process.env.STRIPE_SECRET_KEY;
const enabled = Boolean(
  process.env.STRIPE_SANDBOX_TESTS &&
  key &&
  process.env.DATABASE_URL_OWNER &&
  process.env.DATABASE_URL_APP,
);

if (enabled && !key?.startsWith("sk_test_")) {
  throw new Error("Refusing to run invoice rehearsal against a live key.");
}

// Signed locally with the SDK's test helper, so the route's real signature
// verification runs rather than being stubbed out.
const WEBHOOK_SECRET = "whsec_rehearsal_secret";

describe.skipIf(!enabled)("invoice.created, on a test clock", () => {
  const stamp = Date.now();
  const orgSlug = `rehearsal-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let stripe: import("stripe").default;
  let clockId = "";
  let customerId = "";
  let orgId = "";
  let subscriptionId = "";
  let cycleOneStart = 0;
  let cycleOneEnd = 0;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { getStripe } = await import("@/lib/billing");
    stripe = getStripe();
  }, 60_000);

  afterAll(async () => {
    // Deleting the clock takes its customers, subscriptions, and invoices with
    // it, so cleanup cannot leave test objects stranded in the account.
    if (clockId)
      await stripe.testHelpers.testClocks.del(clockId).catch(() => {});
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${orgSlug}`;
      await owner.end();
    }
    if (closePool) await closePool();
  }, 60_000);

  /** Wait for the clock to settle after an advance. */
  async function settle(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
      if (clock.status === "ready") return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Test clock did not settle.");
  }

  /**
   * A draft invoice for a cycle starting at or after `minPeriodStart`.
   *
   * Filtered rather than "the newest draft": a subscription's FIRST invoice is
   * also a draft for a moment, and picking it up made the test look like the
   * handler had billed the wrong window when it had simply been handed the
   * wrong invoice.
   */
  async function draftInvoice(
    minPeriodEnd: number,
  ): Promise<import("stripe").default.Invoice> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        status: "draft",
        limit: 10,
      });
      // Matched on period_END, because period_start is the start of the cycle
      // that elapsed - the same fact the handler itself gets wrong when this
      // test fails.
      const match = invoices.data.find(
        (invoice) =>
          invoice.billing_reason === "subscription_cycle" &&
          invoice.period_end >= minPeriodEnd,
      );
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      `Stripe never opened a draft cycle invoice ending at or after ${minPeriodEnd}.`,
    );
  }

  /** Deliver an event to the real route, signed the way Stripe signs it. */
  async function deliver(invoice: import("stripe").default.Invoice) {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const payload = JSON.stringify({
      id: `evt_rehearsal_${Date.now()}`,
      object: "event",
      type: "invoice.created",
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: invoice },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    return POST(
      new Request("https://api.flagon.io/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
  }

  it("bills the cycle that ENDED, exactly once, and never twice", async () => {
    const { ensureProPriceId } = await import("@/lib/billing");
    ({ closePool } = await import("@/db/client"));

    // --- a subscribed customer on a clock ------------------------------
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.UTC(2026, 0, 15) / 1000),
      name: `flagon rehearsal ${stamp}`,
    });
    clockId = clock.id;

    const customer = await stripe.customers.create({
      name: `Flagon rehearsal ${stamp}`,
      // Required by send_invoice collection: Stripe will not open an invoice
      // it has no way to deliver.
      email: `rehearsal-${stamp}@example.com`,
      test_clock: clockId,
      metadata: { flagon_test: "1" },
    });
    customerId = customer.id;

    // A card, so the subscription behaves the way a real customer's does:
    // the first invoice is paid at once and only the CYCLE ROLLOVER leaves a
    // draft sitting open. Collecting by send_invoice instead left the first
    // invoice in draft too, and the test picked it up by mistake.
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customerId,
    });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: await ensureProPriceId() }],
      collection_method: "charge_automatically",
    });
    subscriptionId = subscription.id;
    const item = subscription.items.data[0];
    cycleOneStart = item.current_period_start;
    cycleOneEnd = item.current_period_end;

    // --- an organization Stripe can be traced back to -------------------
    const [org] = await owner`
      INSERT INTO organizations (slug, name, plan, stripe_customer_id, stripe_subscription_id)
      VALUES (${orgSlug}, 'Rehearsal', 'pro', ${customerId}, ${subscription.id})
      RETURNING id
    `;
    orgId = org.id;

    // --- usage inside the first cycle -----------------------------------
    // Seeded as rollups, which is what closePeriod prices: the compaction
    // that produces them is tested separately (usage-events.test.ts).
    const usageDay = new Date((cycleOneStart + 86_400) * 1000)
      .toISOString()
      .slice(0, 10);
    const EVALUATIONS = 50_000_000;
    await owner`
      INSERT INTO usage_rollups (organization_id, project_id, meter, day, quantity)
      VALUES (${orgId}, NULL, 'flags.evaluations', ${usageDay}, ${EVALUATIONS})
    `;

    // What the invoice SHOULD come to, computed from the same helpers the
    // pricing page uses rather than a number typed into this test.
    const { applyIncludedCredit, getMeter, lineFromMeter } =
      await import("@/lib/meters");
    const { PLANS } = await import("@/lib/plans");
    const expected = applyIncludedCredit(
      [lineFromMeter(getMeter("flags.evaluations")!, EVALUATIONS)],
      PLANS.pro.includedUsageCents,
    );
    expect(expected.overageCents).toBeGreaterThan(0);

    // --- advance past the cycle boundary --------------------------------
    // One minute past, not one hour: Stripe finalizes a draft about an hour of
    // CLOCK time after opening it, and the handler only works on drafts.
    await stripe.testHelpers.testClocks.advance(clockId, {
      frozen_time: cycleOneEnd + 60,
    });
    await settle();

    const invoice = await draftInvoice(cycleOneEnd);
    expect(invoice.status).toBe("draft");
    // The contract this whole file exists to pin down: the invoice's OWN
    // period is the cycle that just elapsed, while its line items carry the
    // month ahead. Assert both, so a future Stripe change to either one fails
    // here rather than in someone's billing.
    expect(invoice.period_start).toBe(cycleOneStart);
    expect(invoice.period_end).toBe(cycleOneEnd);
    expect(invoice.lines.data[0]?.period?.start).toBe(cycleOneEnd);

    // --- deliver, and check what Stripe actually holds -------------------
    const first = await deliver(invoice);
    expect(first.status).toBe(200);

    const afterFirst = await stripe.invoiceItems.list({
      invoice: invoice.id as string,
      limit: 100,
    });
    expect(afterFirst.data.length).toBeGreaterThan(0);
    const total = afterFirst.data.reduce((sum, line) => sum + line.amount, 0);
    expect(total).toBe(expected.overageCents);
    // The credit is a visible negative line, not a hidden discount.
    expect(afterFirst.data.some((line) => line.amount < 0)).toBe(true);

    // The window billed is EXACTLY the cycle that ended - the invoice's own
    // period, up to the day before it closes. This is the assertion that
    // caught the original bug: the code read period_start as the start of the
    // cycle being OPENED and subtracted another month, so it billed the month
    // before the one that had just elapsed, and the seeded usage never
    // appeared on any invoice.
    const [period] = await owner`
      SELECT period_start, period_end, status FROM billing_periods
      WHERE organization_id = ${orgId}
    `;
    expect(period.status).toBe("invoiced");
    const isoDay = (unix: number) =>
      new Date(unix * 1000).toISOString().slice(0, 10);
    // A `date` column arrives as a Date at LOCAL midnight, so stringifying it
    // directly reads a day early west of UTC. Both sides go through the same
    // UTC formatting instead.
    const dbDay = (value: unknown) =>
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
    expect(dbDay(period.period_start)).toBe(isoDay(cycleOneStart));
    expect(dbDay(period.period_end)).toBe(isoDay(cycleOneEnd - 86_400));

    // --- redelivery must not double-bill ---------------------------------
    const second = await deliver(invoice);
    expect(second.status).toBe(200);
    const afterSecond = await stripe.invoiceItems.list({
      invoice: invoice.id as string,
      limit: 100,
    });
    expect(afterSecond.data.length).toBe(afterFirst.data.length);
    expect(afterSecond.data.reduce((sum, line) => sum + line.amount, 0)).toBe(
      total,
    );
  }, 300_000);

  it("leaves a CONTRACTED organization's invoice alone", async () => {
    // Enterprise is invoiced by agreement; attaching usage here would charge
    // the negotiated fee plus 100% of metered usage.
    await owner`UPDATE organizations SET plan = 'enterprise' WHERE id = ${orgId}`;

    const usageDay = new Date((cycleOneEnd + 86_400) * 1000)
      .toISOString()
      .slice(0, 10);
    await owner`
      INSERT INTO usage_rollups (organization_id, project_id, meter, day, quantity)
      VALUES (${orgId}, NULL, 'flags.evaluations', ${usageDay}, 90000000)
    `;

    // A second rollover, so this is a fresh invoice rather than the one the
    // previous test already billed. The boundary is READ from the
    // subscription rather than assumed to be 31 days out: overshooting it
    // gives Stripe the hour of clock time it needs to finalize the draft, and
    // a finalized invoice cannot take usage items at all.
    const renewed = await stripe.subscriptions.retrieve(subscriptionId);
    const cycleTwoEnd = renewed.items.data[0].current_period_end;
    await stripe.testHelpers.testClocks.advance(clockId, {
      frozen_time: cycleTwoEnd + 60,
    });
    await settle();

    const invoice = await draftInvoice(cycleTwoEnd);
    const before = await stripe.invoiceItems.list({
      invoice: invoice.id as string,
      limit: 100,
    });
    const response = await deliver(invoice);
    expect(response.status).toBe(200);

    const after = await stripe.invoiceItems.list({
      invoice: invoice.id as string,
      limit: 100,
    });
    expect(after.data.length).toBe(before.data.length);
  }, 300_000);
});
