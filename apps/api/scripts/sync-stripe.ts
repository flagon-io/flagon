/**
 * Idempotent Stripe reconciler — makes the LIVE (or test) Stripe account match what
 * the CODE says billing should be, so a pricing change ships by editing a constant
 * and deploying. Wired into the Vercel build (`npm run stripe:sync`, see vercel.json)
 * so prices "auto-migrate": change `EVENTS_METER.pricePerMillionCents` in
 * src/usage/meters.ts, push, and this brings Stripe into line.
 *
 * The one source of truth is the code:
 *   - Metered events RATE = `EVENTS_METER.pricePerMillionCents` (usage/meters.ts).
 *   - Pro base fee = $50 (a stable constant here; the reprice is about the rate).
 *
 * What it does, all idempotent (a no-op once Stripe already matches):
 *   1. Ensure the "Flagon Pro" product + $50/mo base price (lookup `flagon_pro_monthly`).
 *   2. Ensure the `flagon_events` Billing Meter.
 *   3. Ensure the metered price (lookup `flagon_events_metered`) sits at the code's rate.
 *      Stripe prices are immutable, so a rate CHANGE means: create a new price at the
 *      new rate, TRANSFER the lookup key onto it, then archive the old one.
 *   4. Swap every active subscription's metered item onto the current metered price, so
 *      existing customers (incl. the comped `flagon` org) bill at the new rate. This
 *      runs every time and self-heals a partial previous run.
 *
 * Safety:
 *   - No STRIPE_SECRET_KEY -> logs and exits 0 (self-hosters / pre-billing deploys and
 *     preview builds without billing keys never fail the build).
 *   - Any Stripe error WITH a key set -> exits non-zero, failing the deploy on purpose:
 *     we would rather block a deploy than ship code that promises a rate Stripe isn't
 *     charging. Re-running after the transient clears finishes the migration.
 *   - It acts on whatever account STRIPE_SECRET_KEY points at, so a production build
 *     (live key) reconciles live and a preview build (test/no key) does not touch live.
 *
 *   node --env-file-if-exists=.env --import tsx scripts/sync-stripe.ts
 */
import type Stripe from "stripe";
import {
  getStripe,
  PRO_PRICE_LOOKUP_KEY,
  EVENTS_METER_EVENT_NAME,
  EVENTS_METERED_PRICE_LOOKUP_KEY,
} from "../src/lib/stripe.js";
import { EVENTS_METER } from "../src/usage/meters.js";

/** The Pro base fee in cents. Stable; the metered RATE is the moving part below. */
const PRO_BASE_CENTS = 5000;

/**
 * The metered price's `unit_amount_decimal` (cents per single event) derived from the
 * code rate: `pricePerMillionCents` cents buy 1,000,000 events, so one event costs
 * `pricePerMillionCents / 1e6` cents. Trailing zeros trimmed; Stripe takes up to 12dp.
 * e.g. 3000 -> "0.003" ($0.03/1K), 5000 -> "0.005", 2500 -> "0.0025".
 */
function desiredUnitAmountDecimal(): string {
  const perEvent = EVENTS_METER.pricePerMillionCents / 1_000_000;
  return perEvent.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

/** 1 + 2: ensure the Pro product + $50 base price exist. Returns the product id. */
async function ensureBaseProduct(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const base = existing.data[0];
  if (base) {
    return typeof base.product === "string" ? base.product : base.product.id;
  }
  const product = await stripe.products.create({ name: "Flagon Pro" });
  await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PRO_BASE_CENTS,
    recurring: { interval: "month" },
    lookup_key: PRO_PRICE_LOOKUP_KEY,
  });
  console.log(`  created product ${product.id} + $50 base price`);
  return product.id;
}

/** 3a: ensure the `flagon_events` Billing Meter. Returns its id. */
async function ensureMeter(stripe: Stripe): Promise<string> {
  const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
  const found = meters.data.find((m) => m.event_name === EVENTS_METER_EVENT_NAME);
  if (found) return found.id;
  const meter = await stripe.billing.meters.create({
    display_name: "Flagon Events",
    event_name: EVENTS_METER_EVENT_NAME,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
  console.log(`  created meter ${meter.id}`);
  return meter.id;
}

/**
 * 3b: ensure the metered price sits at the code's rate. Returns the id of the price
 * that now carries the `flagon_events_metered` lookup key at the desired rate.
 */
async function ensureMeteredPriceAtRate(
  stripe: Stripe,
  productId: string,
  meterId: string,
): Promise<string> {
  const desired = desiredUnitAmountDecimal();
  const current = (
    await stripe.prices.list({
      lookup_keys: [EVENTS_METERED_PRICE_LOOKUP_KEY],
      active: true,
      limit: 1,
    })
  ).data[0];

  if (current && Number(current.unit_amount_decimal) === Number(desired)) {
    console.log(`  metered price already at $${desired}/event (id ${current.id})`);
    return current.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    billing_scheme: "per_unit",
    unit_amount_decimal: desired,
    recurring: { interval: "month", usage_type: "metered", meter: meterId },
    lookup_key: EVENTS_METERED_PRICE_LOOKUP_KEY,
    // Steal the lookup key from the old price so runtime resolution finds the new one.
    transfer_lookup_key: Boolean(current),
  });
  console.log(
    current
      ? `  repriced metered: new price ${price.id} at $${desired}/event (was ${current.unit_amount_decimal}); lookup key transferred`
      : `  created metered price ${price.id} at $${desired}/event`,
  );
  return price.id;
}

/**
 * 4: swap every active subscription's metered item onto `targetPriceId`. Runs every
 * time (idempotent — skips items already on target), so a rate change reaches existing
 * customers and a partially-failed previous run self-heals. Metered items get
 * `proration_behavior: "none"` (usage bills in arrears via the meter, nothing to prorate).
 */
async function reconcileSubscriptions(
  stripe: Stripe,
  targetPriceId: string,
): Promise<number> {
  const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
  let swapped = 0;
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    if (!LIVE_STATUSES.has(sub.status)) continue;
    for (const item of sub.items.data) {
      const price = item.price;
      const isMetered = price.recurring?.usage_type === "metered";
      if (!isMetered || price.id === targetPriceId) continue;
      await stripe.subscriptionItems.update(item.id, {
        price: targetPriceId,
        proration_behavior: "none",
      });
      swapped++;
      console.log(`  swapped sub ${sub.id} item ${item.id} -> ${targetPriceId}`);
    }
  }
  return swapped;
}

/** Archive any leftover active metered prices on the product that aren't the target. */
async function archiveStaleMeteredPrices(
  stripe: Stripe,
  productId: string,
  targetPriceId: string,
): Promise<number> {
  let archived = 0;
  for await (const price of stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  })) {
    if (
      price.recurring?.usage_type === "metered" &&
      price.id !== targetPriceId
    ) {
      await stripe.prices.update(price.id, { active: false });
      archived++;
      console.log(`  archived stale metered price ${price.id}`);
    }
  }
  return archived;
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("stripe:sync — STRIPE_SECRET_KEY not set; skipping (billing not configured).");
    return;
  }
  const stripe = getStripe();
  const live = process.env.STRIPE_SECRET_KEY.startsWith("sk_live");
  console.log(`stripe:sync — ${live ? "LIVE" : "test"} mode; target rate $${desiredUnitAmountDecimal()}/event ($${(EVENTS_METER.pricePerMillionCents / 1000 / 100).toFixed(2)}/1K)`);

  const productId = await ensureBaseProduct(stripe);
  const meterId = await ensureMeter(stripe);
  const targetPriceId = await ensureMeteredPriceAtRate(stripe, productId, meterId);
  const swapped = await reconcileSubscriptions(stripe, targetPriceId);
  const archived = await archiveStaleMeteredPrices(stripe, productId, targetPriceId);

  console.log(
    `stripe:sync done — ${swapped} subscription item(s) moved, ${archived} old price(s) archived.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("stripe:sync FAILED:", err);
    process.exit(1);
  });
