/**
 * End-to-end Stripe validation for metered billing (TEST MODE ONLY), using Test Clocks
 * to fast-forward full billing cycles and FINALIZE real invoices. Proves the whole
 * money matrix — under the credit, over the credit, and fully comped:
 *
 *   usage < $50  -> invoice $50  (base minimum; credit covers usage)
 *   usage > $50  -> invoice $50 + (usage − $50)
 *   comped 100%  -> invoice $0   (coupon zeroes everything)
 *
 *   node --env-file=.env --import tsx scripts/validate-metered.ts
 *
 * Requires a TEST-mode STRIPE_SECRET_KEY. Refuses to run against a live key.
 */
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import {
  getStripe,
  getProPriceId,
  getMeteredPriceId,
  EVENTS_METER_EVENT_NAME,
} from "../src/lib/stripe.js";
import { PRO_CREDIT_CENTS } from "../src/lib/plans.js";

const RATE_PER_EXPOSURE = 0.05 / 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const nowUnix = () => Math.floor(Date.now() / 1000);

type Scenario = { name: string; exposures: number; comped?: boolean; expectedCents: number };

async function runScenario(
  stripe: Stripe,
  basePriceId: string,
  meteredPriceId: string,
  compCouponId: string,
  s: Scenario,
): Promise<boolean> {
  console.log(`\n=== ${s.name} ===`);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: nowUnix() });
  try {
    const customer = await stripe.customers.create({
      name: `validate ${s.name} (delete me)`,
      test_clock: clock.id,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: basePriceId }, { price: meteredPriceId }],
      ...(s.comped ? { discounts: [{ coupon: compCouponId }] } : {}),
    });
    const item0 = sub.items.data[0]!;

    await stripe.billing.meterEvents.create({
      event_name: EVENTS_METER_EVENT_NAME,
      identifier: randomUUID(),
      payload: { stripe_customer_id: customer.id, value: String(s.exposures) },
    });
    await stripe.billing.creditGrants.create({
      customer: customer.id,
      amount: { type: "monetary", monetary: { currency: "usd", value: PRO_CREDIT_CENTS } },
      applicability_config: { scope: { price_type: "metered" } },
      category: "paid",
      expires_at: item0.current_period_end + 3 * 86400,
    });

    await sleep(4000);
    await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: item0.current_period_end + 2 * 86400,
    });
    for (let i = 0; i < 40; i++) {
      const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (c.status === "ready") break;
      await sleep(3000);
    }

    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
    const cycle =
      invoices.data.find((i) => i.billing_reason === "subscription_cycle") ??
      invoices.data.find((i) => (i.total ?? 0) !== 0) ??
      invoices.data[0];
    if (!cycle) throw new Error("no invoice generated");

    console.log(
      `  ${s.exposures.toLocaleString()} exposures = ${usd(Math.round(s.exposures * RATE_PER_EXPOSURE * 100))} usage${s.comped ? " (100% comped)" : ""}`,
    );
    for (const l of cycle.lines.data) console.log(`    ${usd(l.amount)}\t${l.description ?? ""}`);
    console.log(`    subtotal ${usd(cycle.subtotal)} -> TOTAL ${usd(cycle.total)}`);
    const ok = cycle.total === s.expectedCents;
    console.log(`  expected ${usd(s.expectedCents)}, got ${usd(cycle.total)} => ${ok ? "PASS ✓" : "FAIL ✗"}`);
    return ok;
  } finally {
    await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
  }
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Set STRIPE_SECRET_KEY (test mode).");
  if (key.startsWith("sk_live")) throw new Error("Refusing to run against a LIVE key.");

  const stripe = getStripe();
  const basePriceId = await getProPriceId();
  const meteredPriceId = await getMeteredPriceId();
  const coupon = await stripe.coupons.create({ percent_off: 100, duration: "forever" });

  const scenarios: Scenario[] = [
    { name: "under the credit", exposures: 500_000, expectedCents: 5000 }, // $15 usage -> $50
    { name: "over the credit", exposures: 3_000_000, expectedCents: 9000 }, // $90 usage -> $90
    { name: "comped (100% off)", exposures: 3_000_000, comped: true, expectedCents: 0 },
  ];

  let allOk = true;
  for (const s of scenarios) {
    const ok = await runScenario(stripe, basePriceId, meteredPriceId, coupon.id, s);
    allOk = allOk && ok;
  }
  await stripe.coupons.del(coupon.id).catch(() => {});

  console.log(`\n${allOk ? "ALL SCENARIOS PASS ✓✓✓" : "SOME SCENARIOS FAILED ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err: unknown) => {
  const e = err as Stripe.errors.StripeError;
  console.error(`\nERROR: ${e?.message ?? err}`);
  process.exit(1);
});
