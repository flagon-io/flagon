/**
 * Idempotent Stripe setup for metered billing. Ensures, in whichever account the
 * STRIPE_SECRET_KEY points at (test or live):
 *
 *   1. A "Flagon Pro" product.
 *   2. The flat base price ($50/mo, lookup_key `flagon_pro_monthly`).
 *   3. A Billing Meter `flagon_events` (sum aggregation, keyed by stripe_customer_id).
 *   4. A metered price at $0.05/1K (lookup_key `flagon_events_metered`) on the Pro
 *      product, attached to that meter.
 *
 * Safe to re-run: every step looks up before it creates. Run against TEST mode first
 * (a sandbox key), verify, then re-run against LIVE.
 *
 *   node --env-file=.env --import tsx scripts/setup-metered.ts
 *
 * Requires STRIPE_SECRET_KEY.
 */
import {
  getStripe,
  PRO_PRICE_LOOKUP_KEY,
  EVENTS_METER_EVENT_NAME,
  EVENTS_METERED_PRICE_LOOKUP_KEY,
} from "../src/lib/stripe.js";

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY to run this.");
    process.exit(1);
  }
  const stripe = getStripe();
  const live = process.env.STRIPE_SECRET_KEY.startsWith("sk_live");
  console.log(`Stripe mode: ${live ? "LIVE" : "test"}`);

  // 1 + 2. Pro product + $50 flat base price (lookup_key flagon_pro_monthly).
  let baseProductId: string;
  const basePrices = await stripe.prices.list({
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (basePrices.data[0]) {
    const p = basePrices.data[0];
    baseProductId = typeof p.product === "string" ? p.product : p.product.id;
    console.log(`base price exists: ${p.id} (product ${baseProductId})`);
  } else {
    const product = await stripe.products.create({ name: "Flagon Pro" });
    baseProductId = product.id;
    const price = await stripe.prices.create({
      product: baseProductId,
      currency: "usd",
      unit_amount: 5000,
      recurring: { interval: "month" },
      lookup_key: PRO_PRICE_LOOKUP_KEY,
    });
    console.log(`created product ${baseProductId} + base price ${price.id}`);
  }

  // 3. Billing Meter flagon_events (idempotent by event_name among active meters).
  const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
  let meter = meters.data.find((m) => m.event_name === EVENTS_METER_EVENT_NAME);
  if (meter) {
    console.log(`meter exists: ${meter.id} (${meter.event_name})`);
  } else {
    meter = await stripe.billing.meters.create({
      display_name: "Flagon Events",
      event_name: EVENTS_METER_EVENT_NAME,
      default_aggregation: { formula: "sum" },
      customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
      value_settings: { event_payload_key: "value" },
    });
    console.log(`created meter ${meter.id}`);
  }

  // 4. Metered price at $0.05/1K (lookup_key flagon_events_metered) on the Pro product.
  const meteredPrices = await stripe.prices.list({
    lookup_keys: [EVENTS_METERED_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (meteredPrices.data[0]) {
    console.log(`metered price exists: ${meteredPrices.data[0].id}`);
  } else {
    const price = await stripe.prices.create({
      product: baseProductId,
      currency: "usd",
      billing_scheme: "per_unit",
      // 0.005 cents per exposure = $0.05 per 1,000. Decimal to avoid rounding.
      unit_amount_decimal: "0.005",
      recurring: { interval: "month", usage_type: "metered", meter: meter.id },
      lookup_key: EVENTS_METERED_PRICE_LOOKUP_KEY,
    });
    console.log(`created metered price ${price.id}`);
  }

  console.log("\nSetup complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
