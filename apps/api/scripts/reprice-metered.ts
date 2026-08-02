/**
 * Reprice the LIVE Stripe base + metered prices to the current code constants, by
 * creating new prices and TRANSFERRING the lookup keys onto them (Stripe prices are
 * immutable, so a price change is a new price + a lookup-key move). After this runs,
 * getProPriceId()/getMeteredPriceId() resolve to the new prices — new checkouts land
 * on them with no code change; a deploy clears the in-process price-id cache.
 *
 * Targets are DERIVED from the source of truth so they can never drift from the app:
 *   - base flat price   = PRO_CREDIT_CENTS            (the base fee == the credit)
 *   - metered unit price = EVENTS_METER.pricePerMillionCents / 1,000,000  (cents/unit)
 *
 * Idempotent: if a lookup key already points at a price already at the target amount,
 * that side is skipped. Existing subscriptions are NOT touched — they keep their old
 * price ids (fine: the only Pro sub is the 100%-off comped `flagon` org, which nets $0
 * either way). Only NEW checkouts pick up the new prices.
 *
 *   # dry run (default): show what would change
 *   node --env-file=.env --import tsx scripts/reprice-metered.ts
 *   # write
 *   node --env-file=.env --import tsx scripts/reprice-metered.ts --apply
 *
 * Run against TEST mode first (sandbox key), verify with validate-metered.ts, then LIVE.
 * Requires STRIPE_SECRET_KEY.
 */
import Stripe from "stripe";
import {
  getStripe,
  PRO_PRICE_LOOKUP_KEY,
  EVENTS_METERED_PRICE_LOOKUP_KEY,
} from "../src/lib/stripe.js";
import { PRO_CREDIT_CENTS } from "../src/lib/plans.js";
import { EVENTS_METER } from "../src/usage/meters.js";

const TARGET_BASE_CENTS = PRO_CREDIT_CENTS; // base fee == the usage credit
const TARGET_METERED_DECIMAL = String(EVENTS_METER.pricePerMillionCents / 1_000_000);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The product id a price hangs off (prices carry product as id or expanded object). */
function productIdOf(price: Stripe.Price): string {
  return typeof price.product === "string" ? price.product : price.product.id;
}

async function currentPrice(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | undefined> {
  const { data } = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return data[0];
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY to run this.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const stripe = getStripe();
  const live = process.env.STRIPE_SECRET_KEY.startsWith("sk_live");
  console.log(`Stripe mode: ${live ? "LIVE" : "test"}`);
  console.log(apply ? "APPLY mode\n" : "DRY RUN (pass --apply to write)\n");
  console.log(
    `Targets: base ${usd(TARGET_BASE_CENTS)}/mo, metered ${TARGET_METERED_DECIMAL} cents/exposure ` +
      `($${(EVENTS_METER.pricePerMillionCents / 100 / 1000).toFixed(2)}/1K)\n`,
  );

  // --- Base flat price -------------------------------------------------------
  const base = await currentPrice(stripe, PRO_PRICE_LOOKUP_KEY);
  if (!base) {
    console.error(
      `No active price with lookup_key "${PRO_PRICE_LOOKUP_KEY}". Run setup-metered.ts first (fresh account).`,
    );
    process.exit(1);
  }
  if (base.unit_amount === TARGET_BASE_CENTS) {
    console.log(`base: already ${usd(TARGET_BASE_CENTS)} (${base.id}) — skip`);
  } else {
    console.log(`base: ${usd(base.unit_amount ?? 0)} (${base.id}) -> ${usd(TARGET_BASE_CENTS)}`);
    if (apply) {
      const created = await stripe.prices.create({
        product: productIdOf(base),
        currency: "usd",
        unit_amount: TARGET_BASE_CENTS,
        recurring: { interval: "month" },
        lookup_key: PRO_PRICE_LOOKUP_KEY,
        transfer_lookup_key: true, // move the key off the old price onto this one
      });
      // A product's default price can't be archived — point the product at the new one first.
      await stripe.products.update(productIdOf(base), { default_price: created.id });
      await stripe.prices.update(base.id, { active: false }); // archive the old
      console.log(`  created ${created.id}, set as default, transferred lookup key, archived ${base.id}`);
    }
  }

  // --- Metered price ---------------------------------------------------------
  const metered = await currentPrice(stripe, EVENTS_METERED_PRICE_LOOKUP_KEY);
  if (!metered) {
    console.error(
      `No active price with lookup_key "${EVENTS_METERED_PRICE_LOOKUP_KEY}". Run setup-metered.ts first.`,
    );
    process.exit(1);
  }
  const meterId =
    typeof metered.recurring?.meter === "string" ? metered.recurring.meter : undefined;
  if (String(metered.unit_amount_decimal) === TARGET_METERED_DECIMAL) {
    console.log(`metered: already ${TARGET_METERED_DECIMAL} cents/unit (${metered.id}) — skip`);
  } else if (!meterId) {
    console.error(`metered price ${metered.id} has no attached meter — cannot recreate safely.`);
    process.exit(1);
  } else {
    console.log(
      `metered: ${metered.unit_amount_decimal} (${metered.id}) -> ${TARGET_METERED_DECIMAL} cents/unit`,
    );
    if (apply) {
      const created = await stripe.prices.create({
        product: productIdOf(metered),
        currency: "usd",
        billing_scheme: "per_unit",
        unit_amount_decimal: TARGET_METERED_DECIMAL,
        recurring: { interval: "month", usage_type: "metered", meter: meterId },
        lookup_key: EVENTS_METERED_PRICE_LOOKUP_KEY,
        transfer_lookup_key: true,
      });
      await stripe.prices.update(metered.id, { active: false });
      console.log(`  created ${created.id}, transferred lookup key, archived ${metered.id}`);
    }
  }

  console.log(
    apply
      ? "\nDone. Deploy the app so instances clear the cached price ids and resolve the new prices."
      : "\nDry run complete. Re-run with --apply to write.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const e = err as Stripe.errors.StripeError;
    console.error(`\nERROR: ${e?.message ?? err}`);
    process.exit(1);
  });
