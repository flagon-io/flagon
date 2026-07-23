// Links the live Stripe price into the price book, so STRIPE_PRO_PRICE_ID can
// be retired.
//
// WHY THIS IS A SCRIPT AND NOT A MIGRATION. A Stripe id is deployment-specific:
// production, the sandbox, every self-host and every preview have different
// ones, and most have none at all. A versioned SQL migration runs identically
// everywhere and cannot call Stripe, so hardcoding an id into one would write
// production's price into every other environment - the same mistake as the env
// var, but permanent and unreviewable. 0035 therefore seeds the price book with
// the plan's TERMS (amount, credit, allowances), which are the same everywhere,
// and this script attaches the Stripe id, which is not.
//
// It is idempotent and safe to re-run: it reads what Stripe actually says and
// writes that, so running it after a price change reconciles rather than
// duplicates.
//
// Usage:
//   node scripts/price-book-link.mjs              # link whatever is configured,
//                                                 # or bootstrap one in test mode
//   node scripts/price-book-link.mjs price_123    # link an explicit price
//   node scripts/price-book-link.mjs --dry-run    # show what it would do
import { config } from "dotenv";
import postgres from "postgres";
import Stripe from "stripe";
import { resolveOwnerUrl } from "./db-urls.mjs";

config({ path: [".env.local", ".env"] });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicit = args.find((arg) => !arg.startsWith("--"));

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL set.");
  process.exit(1);
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const configured = explicit ?? process.env.STRIPE_PRO_PRICE_ID;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = postgres(url, { max: 1 });

const PRO_LOOKUP_KEY = "flagon_pro_monthly";
const testMode =
  process.env.STRIPE_SECRET_KEY.startsWith("sk_test_") ||
  process.env.STRIPE_SECRET_KEY.startsWith("rk_test_");

/**
 * Resolve whatever was configured into a real recurring price.
 *
 * Accepts a product id as well as a price id, because that is the mistake this
 * script most often exists to clean up: `prod_...` in STRIPE_PRO_PRICE_ID
 * breaks Checkout with "No such price", and nothing surfaces it until a
 * customer clicks upgrade.
 */
async function resolvePrice(id) {
  if (id.startsWith("price_")) {
    const price = await stripe.prices.retrieve(id);
    return price;
  }

  if (id.startsWith("prod_")) {
    console.warn(
      `! "${id}" is a PRODUCT id, not a price id.\n` +
        "  Stripe Checkout takes line_items[].price and rejects a product,\n" +
        "  so this value cannot have been working for self-serve upgrades.\n" +
        "  Resolving it to the product's active recurring price.\n",
    );
    const prices = await stripe.prices.list({
      product: id,
      active: true,
      type: "recurring",
      limit: 10,
    });
    if (!prices.data.length) {
      throw new Error(`Product ${id} has no active recurring price.`);
    }
    if (prices.data.length > 1) {
      console.warn(
        `! Product ${id} has ${prices.data.length} active recurring prices.\n` +
          `  Using the most recent (${prices.data[0].id}). Pass one explicitly to override.\n`,
      );
    }
    return prices.data[0];
  }

  throw new Error(`"${id}" is neither a price id nor a product id.`);
}

/**
 * Find (or, in test mode, create) the Pro price when nothing is configured.
 *
 * Mirrors ensureProPriceId in src/lib/billing.ts, including its refusal to
 * invent a catalog entry in live mode: auto-creating a product and price in a
 * real Stripe account produces something nobody reviewed, easy to duplicate and
 * awkward to withdraw once a customer is subscribed to it.
 *
 * `amountCents` comes from the price book row, because in this direction the
 * database is the intent and Stripe is being made to match it. That is the
 * opposite of the linking direction, where an existing Stripe price is the
 * authority on what customers are charged.
 */
async function findOrCreatePrice(amountCents) {
  const existing = await stripe.prices.list({
    lookup_keys: [PRO_LOOKUP_KEY],
    limit: 1,
  });
  if (existing.data[0]) {
    console.log(`Found by lookup key "${PRO_LOOKUP_KEY}".`);
    return existing.data[0];
  }

  if (!testMode) {
    throw new Error(
      `No price carries the lookup key "${PRO_LOOKUP_KEY}" and nothing was configured.\n` +
        "  Refusing to create a product in a LIVE Stripe account. Create the price in\n" +
        "  the dashboard and pass it: npm run price:link -- price_...",
    );
  }

  if (dryRun) {
    console.log(
      `Would create product "Flagon Pro" + a $${(amountCents / 100).toFixed(2)}/month price\n` +
        `  carrying the lookup key "${PRO_LOOKUP_KEY}".`,
    );
    return null;
  }

  console.log("Nothing configured and nothing found; creating it (test mode).");
  const product = await stripe.products.create({
    name: "Flagon Pro",
    description: "Everything unlocked, usage-based.",
  });
  return stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: PRO_LOOKUP_KEY,
  });
}

try {
  // The price book row is read FIRST, because bootstrapping a brand-new Stripe
  // price needs its amount: the database holds the intended price, and Stripe is
  // created to match. Monthly is the only interval Pro is sold at today.
  const [row] = await sql`
    SELECT id, label, unit_amount_cents, included_credit_cents, stripe_price_id
    FROM plan_prices
    WHERE plan = 'pro' AND interval = 'month' AND status = 'active'
    LIMIT 1
  `;

  if (!row) {
    console.error(
      "No active Pro price row. Run `npm run db:migrate` first, or create the " +
        "version in the operator console.",
    );
    process.exit(1);
  }

  const price = configured
    ? await resolvePrice(configured)
    : await findOrCreatePrice(row.unit_amount_cents);

  if (!price) {
    // --dry-run on the bootstrap path: there is nothing to compare against yet.
    console.log(
      `\nPrice book   : ${row.label} (${row.id})\n` +
        `  amount     : $${(row.unit_amount_cents / 100).toFixed(2)} / month\n` +
        `  credit     : $${(row.included_credit_cents / 100).toFixed(2)}\n` +
        "\n--dry-run: nothing written.",
    );
    process.exit(0);
  }

  const amountCents = price.unit_amount ?? 0;
  const interval = price.recurring?.interval ?? "month";
  if (!price.active) {
    console.warn(`! ${price.id} is not active in Stripe.\n`);
  }
  if (interval !== "month") {
    console.warn(
      `! ${price.id} bills ${interval}ly, but the Pro row is monthly.\n` +
        "  Linking anyway; confirm this is what you intend.\n",
    );
  }

  console.log(`Stripe price : ${price.id}`);
  console.log(
    `  amount     : $${(amountCents / 100).toFixed(2)} / ${interval}`,
  );
  console.log(`Price book   : ${row.label} (${row.id})`);
  console.log(
    `  amount     : $${(row.unit_amount_cents / 100).toFixed(2)} / month`,
  );
  console.log(
    `  credit     : $${(row.included_credit_cents / 100).toFixed(2)}`,
  );

  // Stripe is the authority on what customers are CHARGED, so its amount wins.
  // The included credit is ours and is deliberately left alone: it is a pricing
  // decision, not something derivable from the charge.
  if (row.unit_amount_cents !== amountCents) {
    console.warn(
      `\n! Amount mismatch: the price book says $${(row.unit_amount_cents / 100).toFixed(2)} ` +
        `but Stripe charges $${(amountCents / 100).toFixed(2)}.\n` +
        "  Stripe wins - it is what customers actually pay. Review the included\n" +
        "  credit afterwards: it is NOT adjusted automatically.\n",
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    process.exit(0);
  }

  await sql`
    UPDATE plan_prices
    SET stripe_price_id = ${price.id},
        unit_amount_cents = ${amountCents},
        updated_at = now()
    WHERE id = ${row.id}
  `;

  console.log(`\nLinked. STRIPE_PRO_PRICE_ID can now be removed.`);
  if (row.included_credit_cents !== amountCents) {
    console.log(
      `Note: this price includes $${(row.included_credit_cents / 100).toFixed(2)} of usage ` +
        `against a $${(amountCents / 100).toFixed(2)} fee. Confirm that is intended.`,
    );
  }
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
