/**
 * Idempotent Stripe reconciler — makes the LIVE (or test) Stripe account match what
 * the CODE says billing should be, so a pricing change ships by editing a constant
 * and deploying. Wired into the Vercel build (`npm run stripe:sync`, see vercel.json)
 * so prices "auto-migrate": change `EVENTS_METER.pricePerMillionCents` in
 * src/usage/meters.ts, push, and this brings Stripe into line.
 *
 * The desired billing shape — ONE PRODUCT PER BILLING LINE, so every checkout/invoice/
 * subscription line reads PLAINLY by its own name instead of a shared "Platform Usage":
 *   - "Flagon Pro"                → the flat $50/mo base price (lookup `flagon_pro_monthly`).
 *   - "Flagon Events"             → the metered events price (`flagon_events_metered`).
 *   - "Flagon Browser check runs" → the metered browser-run price.
 *   - "Flagon Uptime monitors"    → the metered uptime GAUGE (current-count, `last`).
 * Each product carries its own DESCRIPTION (the sub-line under the price at checkout);
 * no description states a dollar amount (the price line already shows it). The metered
 * product set is DERIVED from the code (SOURCE_METERS + METERS), so a new meter mints its
 * own plainly-named product automatically.
 *
 * The one source of truth is the code:
 *   - Metered RATES = `METERS[...].pricePerMillionCents` (usage/meters.ts).
 *   - Uptime count pricing = lib/plans.ts (included allowance + 25-block rate).
 *   - Pro base fee = $50 (a stable constant here; the reprice is about the rates).
 *   - Product names + descriptions = the constants + per-meter map below.
 *
 * What it does, all idempotent (a no-op once Stripe already matches):
 *   1. Ensure the "Flagon Pro" product + $50/mo base price.
 *   2. For each metered line: ensure its OWN product + Billing Meter + metered price at
 *      the code's rate ON THAT product. Prices are immutable, so a rate OR product change
 *      creates a fresh price, TRANSFERS the lookup key, and archives the superseded one.
 *   3. Ensure the "Flagon Uptime monitors" product + its licensed graduated price.
 *   4. Reconcile every active subscription: one metered item per meter (swapped/added),
 *      and the uptime item at the org's active-monitor count (stale items migrated).
 *   5. Archive stale prices and retire the legacy shared "Platform Usage" product once
 *      empty, so the account shows exactly one product per billing line.
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
  UPTIME_MONITORS_METER_EVENT_NAME,
  UPTIME_MONITORS_PRICE_LOOKUP_KEY,
} from "../src/lib/stripe.js";
import { METERS, SOURCE_METERS, UPTIME_MONITORS_METER } from "../src/usage/meters.js";

/** The old LICENSED uptime price's lookup key, retired when uptime moved to a metered
 *  gauge. Its price + any subscription items are cleaned up so nothing double-bills. */
const LEGACY_UPTIME_LICENSED_LOOKUP_KEY = "flagon_uptime_monitors_licensed";

/** The Pro base fee in cents. Stable; the metered RATE is the moving part below. */
const PRO_BASE_CENTS = 5000;

/**
 * The full set of METERED lines the code declares — one per distinct Stripe Billing
 * Meter, derived from the SOURCE_METERS registry (usage/meters.ts). Multiple sources
 * can share one meter (exposures + experiment metrics both bill under `flagon_events`),
 * so we dedup by `eventName`. Adding a billable source with a new meter (e.g. a check-
 * run family) makes a new line appear here automatically, and this script provisions
 * its Stripe Billing Meter + metered price + subscription item. This is why "add a
 * meter in code, deploy" is all that a new billable unit needs.
 */
type MeteredLine = {
  eventName: string;
  lookupKey: string;
  /** Stripe meter display name / PRODUCT name, e.g. "Flagon Events", "Flagon Browser
   *  check runs" — this is what shows PLAINLY as the invoice/subscription line label. */
  displayName: string;
  /** The muted sub-line under the price (checkout/invoice). No dollar amounts. */
  description: string;
  pricePerMillionCents: number;
  /** Meter aggregation: "sum" (per-event usage) or "last" (a gauge — current count). */
  aggregation: "sum" | "last";
  /** The product's metadata role (defaults to `usage:<eventName>`); set explicitly to
   *  reuse an existing product created under a different role. */
  productRole?: string;
};

/** Per-meter product copy, keyed by the Stripe meter event_name. Adding a new meter
 *  without an entry here falls back to a generic description (still its own product). */
const METER_DESCRIPTIONS: Record<string, string> = {
  flagon_events: "Flag exposures and analytics events across Flagon products, billed per event beyond your plan's included monthly credit.",
  flagon_check_runs_browser: "Synthetic browser check executions, billed per run.",
};

function meteredLines(): MeteredLine[] {
  const byEvent = new Map<string, MeteredLine>();
  for (const sm of Object.values(SOURCE_METERS)) {
    const meter = METERS[sm.meterId];
    if (!meter.billable) continue;
    if (byEvent.has(sm.eventName)) continue;
    byEvent.set(sm.eventName, {
      eventName: sm.eventName,
      lookupKey: sm.priceLookupKey,
      displayName: `Flagon ${meter.label}`,
      description:
        METER_DESCRIPTIONS[sm.eventName] ?? `Flagon ${meter.label}, billed per ${meter.unit}.`,
      pricePerMillionCents: meter.pricePerMillionCents,
      aggregation: meter.aggregation ?? "sum",
    });
  }
  return [...byEvent.values()];
}

/** The uptime-monitors line — metered as a GAUGE (`last`), reported by the usage sweep.
 *  Not a durable-events source (it isn't summed per event), so it's declared here rather
 *  than derived from SOURCE_METERS. Reuses the existing "Flagon Uptime monitors" product. */
function uptimeLine(): MeteredLine {
  return {
    eventName: UPTIME_MONITORS_METER_EVENT_NAME,
    lookupKey: UPTIME_MONITORS_PRICE_LOOKUP_KEY,
    displayName: `Flagon ${UPTIME_MONITORS_METER.label}`,
    description:
      "Active uptime monitors (URL, and more), billed per monitor. Draws down your shared monthly usage credit.",
    pricePerMillionCents: UPTIME_MONITORS_METER.pricePerMillionCents,
    aggregation: UPTIME_MONITORS_METER.aggregation ?? "last",
    productRole: "usage:uptime_monitors",
  };
}

/** cents-per-1M -> Stripe `unit_amount_decimal` (cents per single unit), trailing
 *  zeros trimmed; Stripe takes up to 12dp. 3000 -> "0.003"; 6250000 -> "6.25". */
function unitAmountDecimal(pricePerMillionCents: number): string {
  return (pricePerMillionCents / 1_000_000).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * The desired product name + description for each of the two billing lines. The
 * description is the muted sub-line under the price at checkout / on the invoice. It
 * deliberately states NO dollar amount (the price line shows that) and NO em-dashes,
 * per house copy rules. `role` is stamped into product metadata so this script can
 * re-find each product idempotently without duplicating it.
 */
const PRO_PRODUCT = {
  role: "pro",
  name: "Flagon Pro",
  description:
    "Everything unlocked for your team, usage-based. Includes a monthly usage credit toward your usage across every Flagon product.",
};
const productIdOf = (p: Stripe.Price["product"]): string =>
  typeof p === "string" ? p : p.id;

/**
 * 1: ensure the "Flagon Pro" product (found via its base price's lookup key, or
 * created) carries the desired name/description/metadata and a $50 base price. Returns
 * the product id.
 */
async function ensureBaseProduct(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const base = existing.data[0];
  let productId: string;
  if (base) {
    productId = productIdOf(base.product);
  } else {
    const product = await stripe.products.create({
      name: PRO_PRODUCT.name,
      description: PRO_PRODUCT.description,
      metadata: { flagon_role: PRO_PRODUCT.role },
    });
    productId = product.id;
    await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: PRO_BASE_CENTS,
      recurring: { interval: "month" },
      lookup_key: PRO_PRICE_LOOKUP_KEY,
    });
    console.log(`  created product ${productId} + $50 base price`);
  }
  // Correct the name/description/metadata whether the product is new or drifted (this
  // is what fixes the stale "$20 credit" copy that was typed into the dashboard).
  await stripe.products.update(productId, {
    name: PRO_PRODUCT.name,
    description: PRO_PRODUCT.description,
    metadata: { flagon_role: PRO_PRODUCT.role },
  });
  return productId;
}

/**
 * 2: ensure a DEDICATED product for one billing line (a meter, or the uptime line),
 * so each shows PLAINLY on the subscription/invoice by its own name instead of a shared
 * "Platform Usage" label. Re-found idempotently by its `flagon_role` metadata marker
 * (never duplicated); name/description corrected on drift. Returns the product id.
 */
async function ensureLineProduct(
  stripe: Stripe,
  role: string,
  name: string,
  description: string,
): Promise<string> {
  let found: Stripe.Product | undefined;
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.flagon_role === role) {
      found = p;
      break;
    }
  }
  if (found) {
    await stripe.products.update(found.id, { name, description, metadata: { flagon_role: role } });
    return found.id;
  }
  const product = await stripe.products.create({ name, description, metadata: { flagon_role: role } });
  console.log(`  created product ${product.id} (${name})`);
  return product.id;
}

/** 3: ensure a Billing Meter for `eventName` exists (with the given aggregation, "sum"
 *  for per-event usage or "last" for a gauge). Returns its id. */
async function ensureMeter(
  stripe: Stripe,
  eventName: string,
  displayName: string,
  aggregation: "sum" | "last",
): Promise<string> {
  const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
  const found = meters.data.find((m) => m.event_name === eventName);
  if (found) return found.id;
  const meter = await stripe.billing.meters.create({
    display_name: displayName,
    event_name: eventName,
    default_aggregation: { formula: aggregation },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
  console.log(`  created meter ${meter.id} (${eventName}, ${aggregation})`);
  return meter.id;
}

/**
 * 4: ensure the metered price for `lookupKey` sits at the code's rate AND on the usage
 * product. Prices are immutable, so a wrong rate/product means creating a fresh price
 * and transferring the lookup key onto it. Returns the id of the price that now carries
 * `lookupKey`.
 */
async function ensureMeteredPriceAtRate(
  stripe: Stripe,
  usageProductId: string,
  stripeMeterId: string,
  lookupKey: string,
  pricePerMillionCents: number,
): Promise<string> {
  const desired = unitAmountDecimal(pricePerMillionCents);
  const current = (
    await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  ).data[0];

  const rateOk = current && Number(current.unit_amount_decimal) === Number(desired);
  const productOk = current && productIdOf(current.product) === usageProductId;
  if (current && rateOk && productOk) {
    console.log(`  metered price already correct: ${current.id} at $${desired}/unit (${lookupKey})`);
    return current.id;
  }

  const price = await stripe.prices.create({
    product: usageProductId,
    currency: "usd",
    billing_scheme: "per_unit",
    unit_amount_decimal: desired,
    recurring: { interval: "month", usage_type: "metered", meter: stripeMeterId },
    lookup_key: lookupKey,
    // Steal the lookup key from the old price so runtime resolution finds the new one.
    transfer_lookup_key: Boolean(current),
  });
  // Retire the superseded price so it can't linger active on an old product (which is
  // what would otherwise keep the legacy shared usage product from being retired). Its
  // subscription items are swapped onto the new price by reconcileSubscriptions.
  if (current) await stripe.prices.update(current.id, { active: false });
  console.log(
    current
      ? `  new metered price ${price.id} at $${desired}/unit (${lookupKey}); superseded ${current.id}`
      : `  created metered price ${price.id} at $${desired}/unit (${lookupKey})`,
  );
  return price.id;
}

/**
 * 5b: retire the LEGACY licensed uptime price (from when uptime billed by subscription
 * quantity) now that uptime is a metered gauge. Removes its item from every subscription
 * and archives the price, so nothing double-bills. No-op once it's gone.
 */
async function retireLegacyLicensedUptime(stripe: Stripe): Promise<number> {
  const old = (
    await stripe.prices.list({ lookup_keys: [LEGACY_UPTIME_LICENSED_LOOKUP_KEY], active: true, limit: 1 })
  ).data[0];
  if (!old) return 0;
  let removed = 0;
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  })) {
    for (const item of sub.items.data) {
      if (item.price?.id === old.id) {
        await stripe.subscriptionItems.del(item.id, { proration_behavior: "none" });
        removed++;
        console.log(`  removed legacy licensed uptime item ${item.id} from sub ${sub.id}`);
      }
    }
  }
  await stripe.prices.update(old.id, { active: false });
  console.log(`  archived legacy licensed uptime price ${old.id}`);
  return removed;
}

/**
 * 6b: archive the legacy shared "Flagon Platform Usage" product (metadata role "usage")
 * once its prices have migrated to the per-meter products and it holds no active price —
 * so the account cleanly shows one product per billing line, not a stale catch-all.
 */
async function archiveLegacyUsageProduct(stripe: Stripe): Promise<number> {
  let archived = 0;
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.flagon_role !== "usage") continue;
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 1 });
    if (prices.data.length === 0) {
      await stripe.products.update(p.id, { active: false });
      archived++;
      console.log(`  archived legacy shared usage product ${p.id}`);
    }
  }
  return archived;
}

/**
 * 5: reconcile every active subscription to carry EXACTLY ONE item per managed meter,
 * on the current target price for that meter. Keyed by the price's Stripe meter id, so:
 * a rate change (new price, same meter) SWAPS the existing item; a new meter (a check-
 * run family) ADDS a missing item. Idempotent — items already on target are left alone.
 * Metered items use `proration_behavior: "none"` (usage bills in arrears via the meter).
 */
async function reconcileSubscriptions(
  stripe: Stripe,
  targetsByMeter: Map<string, string>,
): Promise<number> {
  const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
  const targetPriceIds = new Set(targetsByMeter.values());
  let changed = 0;
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  })) {
    if (!LIVE_STATUSES.has(sub.status)) continue;
    // Which managed meters this sub already has an item for (and on which price).
    const haveMeter = new Map<string, Stripe.SubscriptionItem>();
    for (const item of sub.items.data) {
      const meter = item.price.recurring?.meter;
      if (item.price.recurring?.usage_type === "metered" && typeof meter === "string") {
        haveMeter.set(meter, item);
      }
    }
    for (const [meterId, targetPriceId] of targetsByMeter) {
      const existing = haveMeter.get(meterId);
      if (!existing) {
        await stripe.subscriptionItems.create({
          subscription: sub.id,
          price: targetPriceId,
          proration_behavior: "none",
        });
        changed++;
        console.log(`  added sub ${sub.id} item -> ${targetPriceId} (meter ${meterId})`);
      } else if (existing.price.id !== targetPriceId && !targetPriceIds.has(existing.price.id)) {
        await stripe.subscriptionItems.update(existing.id, {
          price: targetPriceId,
          proration_behavior: "none",
        });
        changed++;
        console.log(`  swapped sub ${sub.id} item ${existing.id} -> ${targetPriceId}`);
      }
    }
  }
  return changed;
}

/** 6: archive any leftover active metered prices on the products that aren't a target. */
async function archiveStaleMeteredPrices(
  stripe: Stripe,
  productIds: string[],
  targetPriceIds: Set<string>,
): Promise<number> {
  let archived = 0;
  for (const productId of productIds) {
    for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
      if (price.recurring?.usage_type === "metered" && !targetPriceIds.has(price.id)) {
        await stripe.prices.update(price.id, { active: false });
        archived++;
        console.log(`  archived stale metered price ${price.id} (product ${productId})`);
      }
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
  // Every billable line is metered now (events + synthetic runs by "sum", uptime as a
  // "last" gauge) so the shared $50 credit covers all of it — no separate free tier.
  const lines = [...meteredLines(), uptimeLine()];
  console.log(
    `stripe:sync — ${live ? "LIVE" : "test"} mode; ${lines.length} metered line(s): ` +
      lines.map((l) => `${l.eventName}@$${unitAmountDecimal(l.pricePerMillionCents)}/unit(${l.aggregation})`).join(", "),
  );

  const baseProductId = await ensureBaseProduct(stripe);
  const usageProductIds: string[] = [];

  // Provision every declared metered line on ITS OWN product — so each shows plainly on
  // the subscription/invoice by name (e.g. "Flagon Events", "Flagon Uptime monitors")
  // rather than a shared "Platform Usage" label. Track target price ids per Stripe meter
  // so subscription reconciliation can swap (rate/product change) or add (new meter).
  const targetsByMeter = new Map<string, string>();
  const targetPriceIds = new Set<string>();
  for (const line of lines) {
    const productId = await ensureLineProduct(
      stripe,
      line.productRole ?? `usage:${line.eventName}`,
      line.displayName,
      line.description,
    );
    usageProductIds.push(productId);
    const stripeMeterId = await ensureMeter(stripe, line.eventName, line.displayName, line.aggregation);
    const priceId = await ensureMeteredPriceAtRate(
      stripe,
      productId,
      stripeMeterId,
      line.lookupKey,
      line.pricePerMillionCents,
    );
    targetsByMeter.set(stripeMeterId, priceId);
    targetPriceIds.add(priceId);
  }

  const changed = await reconcileSubscriptions(stripe, targetsByMeter);
  const legacyItems = await retireLegacyLicensedUptime(stripe);
  const archived = await archiveStaleMeteredPrices(stripe, [baseProductId, ...usageProductIds], targetPriceIds);
  const legacy = await archiveLegacyUsageProduct(stripe);

  console.log(
    `stripe:sync done — ${changed} metered item(s) reconciled, ${legacyItems} legacy uptime item(s) removed, ` +
      `${archived} old price(s) archived, ${legacy} legacy product(s) retired.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("stripe:sync FAILED:", err);
    process.exit(1);
  });
