import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { clearPlanCache } from "./usage-events.server";
import {
  describeDiscount,
  discountedTotal,
  durationLabelFor,
  type Discount,
} from "./discounts";

/**
 * Billing mode, resolved from the environment (same pattern as email):
 *
 * - STRIPE_SECRET_KEY present -> billing is ON: plans are real, the plan
 *   selector renders, free-tier limits apply, Pro goes through Stripe.
 * - Absent (self-host default, or a deployment pre-Stripe) -> billing is OFF:
 *   no plan selection, no limits, everything works unmetered. Orgs still
 *   carry a plan column (default "free") but entitlements resolve all-on.
 */
export function billingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

let stripeClient: Stripe | null = null;

/** Stripe client (throws if billing is disabled - guard with billingEnabled). */
export function getStripe(): Stripe {
  if (!billingEnabled()) {
    throw new Error("Billing is not enabled (STRIPE_SECRET_KEY unset).");
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return stripeClient;
}

const PRO_LOOKUP_KEY = "flagon_pro_monthly";
let cachedProPriceId: string | null = null;
const resolvedProductPrices = new Map<string, string>();

/**
 * Coerce a configured Stripe id into a PRICE id.
 *
 * Stripe's Checkout takes `line_items[].price`, which must be a `price_...`.
 * Handing it a `prod_...` fails the call outright with "No such price" - and
 * because product and price ids are both opaque `xxx_` strings that sit next to
 * each other in the dashboard, configuring the product by mistake is easy to do
 * and gives no feedback until a real customer clicks upgrade.
 *
 * So a product id is RESOLVED to that product's active recurring price rather
 * than passed through to fail. There is no ambiguity worth guarding against in
 * practice: a subscription product has one live recurring price, and if it
 * somehow has several this picks the same one every time (Stripe returns them
 * newest-first) rather than failing closed on an upgrade.
 *
 * Anything already a price id is returned untouched, so this costs nothing on
 * the correctly-configured path.
 */
export async function resolveStripePriceId(id: string): Promise<string> {
  if (!id.startsWith("prod_")) return id;

  const cached = resolvedProductPrices.get(id);
  if (cached) return cached;

  const prices = await getStripe().prices.list({
    product: id,
    active: true,
    type: "recurring",
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `Stripe id "${id}" is a PRODUCT, not a price, and it has no active recurring price to fall back to. ` +
        "Set the price id (price_...) instead - Checkout cannot take a product.",
    );
  }
  resolvedProductPrices.set(id, price.id);
  return price.id;
}

/**
 * Test mode is decided by the KEY, not by NODE_ENV.
 *
 * A production build pointed at a sandbox key is a normal, useful setup (a
 * staging deployment), and a development machine holding a live key is the
 * dangerous one. Only the key knows which account the writes land in.
 */
export function isTestModeKey(key: string | undefined): boolean {
  return Boolean(key?.startsWith("sk_test_") || key?.startsWith("rk_test_"));
}

/**
 * The Pro subscription price ($20/mo flat). Resolution order: explicit
 * STRIPE_PRO_PRICE_ID env, then lookup_key search, then create the product +
 * price on the fly (sandbox-friendly: a fresh Stripe account needs zero
 * manual setup).
 */
export async function ensureProPriceId(): Promise<string> {
  // Resolved rather than trusted: a product id here is a silent break, and it
  // is the single easiest thing to get wrong in this variable.
  if (process.env.STRIPE_PRO_PRICE_ID) {
    return resolveStripePriceId(process.env.STRIPE_PRO_PRICE_ID);
  }
  if (cachedProPriceId) return cachedProPriceId;

  const stripe = getStripe();
  const existing = await stripe.prices.list({
    lookup_keys: [PRO_LOOKUP_KEY],
    limit: 1,
  });
  if (existing.data[0]) {
    cachedProPriceId = existing.data[0].id;
    return cachedProPriceId;
  }

  // Auto-creation is a SANDBOX convenience. In live mode it would invent a
  // product and a $20 price in a real Stripe account on the first upgrade
  // click - a catalog entry nobody reviewed, easy to duplicate, and awkward to
  // withdraw once a customer is subscribed to it. Live deployments name the
  // price explicitly with STRIPE_PRO_PRICE_ID (or carry the lookup key above).
  if (!isTestModeKey(process.env.STRIPE_SECRET_KEY)) {
    throw new Error(
      `No Stripe price found for lookup key "${PRO_LOOKUP_KEY}" and STRIPE_PRO_PRICE_ID is unset. ` +
        "Create the Pro price in Stripe and set STRIPE_PRO_PRICE_ID; refusing to create a product in live mode.",
    );
  }

  const product = await stripe.products.create({
    name: "Flagon Pro",
    description:
      "Everything unlocked, usage-based. Includes $20 of monthly usage credit.",
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 2000,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: PRO_LOOKUP_KEY,
  });
  cachedProPriceId = price.id;
  return cachedProPriceId;
}

/**
 * Record a paid Pro subscription on an org. Idempotent; used by the webhook,
 * the checkout-return reconcile, and the upgrade self-heal, so a missed
 * webhook can never permanently strand an org on the wrong plan.
 */
export async function applyProSubscription(
  orgId: string,
  customerId: string | null,
  subscriptionId: string | null,
  cycle?: { start: Date; end: Date } | null,
): Promise<void> {
  await db
    .update(organizations)
    .set({
      plan: "pro",
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(cycle
        ? { currentPeriodStart: cycle.start, currentPeriodEnd: cycle.end }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
  // An upgrade must lift the evaluation cap immediately, not a TTL later.
  clearPlanCache(orgId);
}

/**
 * The subscription's current cycle. The org is the billing entity and each
 * one runs on its own anniversary, so this window - not the calendar month -
 * is what the usage page shows and what a period is closed on.
 *
 * Stripe moved these fields onto the subscription's items, so read the
 * earliest item's window (they share one for a single-price subscription).
 */
export function subscriptionCycle(
  subscription: Stripe.Subscription,
): { start: Date; end: Date } | null {
  const item = subscription.items?.data?.[0];
  if (!item?.current_period_start || !item?.current_period_end) return null;
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

/**
 * Reconcile a checkout return: verify the session with Stripe and apply the
 * upgrade if payment completed for this org. Safe to call on every landing;
 * returns true when the org is (now) on Pro.
 */
export async function reconcileCheckoutSession(
  orgId: string,
  checkoutSessionId: string,
): Promise<boolean> {
  const session =
    await getStripe().checkout.sessions.retrieve(checkoutSessionId);
  if (
    session.client_reference_id !== orgId ||
    session.mode !== "subscription" ||
    session.payment_status !== "paid"
  ) {
    return false;
  }
  await applyProSubscription(
    orgId,
    typeof session.customer === "string" ? session.customer : null,
    typeof session.subscription === "string" ? session.subscription : null,
  );
  return true;
}

/**
 * Stripe's hosted billing portal: payment method, invoices, cancellation.
 * A browser flow like Checkout, so it stays app-only (not part of the
 * versioned API contract). Returns null when the org has no Stripe
 * customer yet, i.e. it has never been upgraded.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string | null> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url ?? null;
}

/**
 * Adds a period's usage to a draft invoice: one line per meter that was
 * used, then the plan's included credit as a negative line. Called when
 * Stripe opens the next invoice (invoice.created), while it is still a
 * draft, so the finalized invoice carries them.
 *
 * Idempotent twice over. The billing period's own status is the primary
 * guard (see billing-periods.server.ts): a period is invoiced once because
 * the row says so. This second check scans the invoice for line keys already
 * present, covering a crash between attaching items and flipping the status.
 *
 * The scan is scoped to THIS INVOICE and paginated. Listing the customer's
 * most recent 100 items instead - the obvious version - silently stops
 * deduplicating once an account accumulates more than a page of history, and
 * the failure mode is double-billing a real customer.
 */
export async function addUsageToInvoice(input: {
  invoiceId: string;
  customerId: string;
  lines: { key: string; description: string; amountCents: number }[];
}): Promise<number> {
  if (!input.lines.length) return 0;
  const stripe = getStripe();

  const existing = await stripe.invoiceItems
    .list({ invoice: input.invoiceId, limit: 100 })
    .autoPagingToArray({ limit: 10_000 });
  const alreadyBilled = new Set(
    existing
      .map((item) => item.metadata?.flagon_line_key)
      .filter((key): key is string => Boolean(key)),
  );

  let added = 0;
  for (const line of input.lines) {
    if (alreadyBilled.has(line.key)) continue;
    await stripe.invoiceItems.create({
      customer: input.customerId,
      invoice: input.invoiceId,
      amount: line.amountCents,
      currency: "usd",
      description: line.description,
      metadata: { flagon_line_key: line.key },
    });
    added += 1;
  }
  return added;
}

export type BillingSummary = {
  subscription: {
    status: string;
    /**
     * What the subscription actually charges each cycle, in cents: the list
     * amount with any discount applied.
     */
    amountCents: number;
    /**
     * The undiscounted recurring amount. Equal to amountCents when there is no
     * discount; shown struck through when there is one, so a customer on a
     * promotion can see both what they normally pay and what they pay now.
     */
    listAmountCents: number;
    currency: string;
    interval: "day" | "week" | "month" | "year" | null;
    intervalCount: number;
    /** When the current cycle renews (or ends, if cancelling). */
    renewsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    /** How Stripe collects: a saved card, or an emailed invoice. */
    collection: "charge_automatically" | "send_invoice";
  } | null;
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  /** The discount in force, mapped for rendering. Null when there is none. */
  discount: Discount | null;
  /**
   * The total of the customer's next invoice, from Stripe's own preview, or
   * null when it could not be previewed (no upcoming invoice, or the call
   * failed). This is the ONE number that is not derived locally, so it is the
   * one that can be trusted to match what gets charged: proration, discounts,
   * taxes and credit balance are all already in it.
   */
  nextInvoiceCents: number | null;
};

/**
 * What a customer is actually on, read from Stripe at render time.
 *
 * The billing page used to describe a PLAN - the marketing feature list -
 * which is the wrong answer for anyone who negotiated their terms: an
 * enterprise customer paying $2,400 a year was shown Pro's $20 and a bullet
 * saying "fixed pricing from usage estimates". Reading the subscription itself
 * means the page cannot disagree with the invoice, whatever the agreement was,
 * and it works identically for self-serve and contract customers.
 *
 * Returns null if Stripe cannot be reached. A billing page that 500s because
 * an upstream call failed is worse than one that falls back to plan data, so
 * every caller treats this as best-effort.
 */
export async function getBillingSummary(
  customerId: string,
  options: {
    /**
     * Preview the next invoice. Off for callers that only need the discount
     * (the usage page), because it is a third round trip to Stripe on a page
     * render for a number that page does not show.
     */
    includeNextInvoice?: boolean;
  } = {},
): Promise<BillingSummary | null> {
  try {
    const stripe = getStripe();
    // Invoices are deliberately NOT fetched: the portal already lists them
    // with PDFs and receipts, and duplicating that here would be a second
    // billing history to keep honest for no new capability.
    const [subscriptions, customer] = await Promise.all([
      stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: "all",
        // The coupon hangs off the discount's SOURCE on this API version
        // (2026-06-24.dahlia); it used to be discount.coupon directly. This is
        // already four expansion levels (data -> discounts -> source ->
        // coupon), which is Stripe's hard limit, so `applies_to` - a fifth
        // level - cannot ride along here and is fetched separately below.
        expand: ["data.discounts.source.coupon"],
      }),
      stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      }),
    ]);

    const subscription = subscriptions.data[0] ?? null;
    const price = subscription?.items.data[0]?.price;
    const currency = price?.currency ?? "usd";
    // The LIST amount: what the prices say, before any discount. Reporting
    // this as the charge - which is what this did - tells a customer on three
    // free months that they are paying $20 a month, right up until they check
    // their card statement and find they are not.
    const listAmountCents =
      subscription?.items.data.reduce(
        (sum, item) =>
          sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1),
        0,
      ) ?? 0;
    // `applies_to` decides whether the discount reaches metered usage or only
    // the subscription, and it is one expansion level past Stripe's limit on
    // the list call, so it comes back undefined there. Fetch it directly - but
    // only when there is actually a coupon, so an undiscounted customer pays no
    // extra round trip.
    const couponId = couponIdOf(subscription);
    const appliesToProducts = couponId
      ? await couponAppliesToProducts(stripe, couponId)
      : [];
    const discount = mapDiscount(subscription, currency, appliesToProducts);
    const amountCents = discountedTotal(
      { subscriptionCents: listAmountCents, usageCents: 0 },
      discount,
    ).totalCents;
    // Stripe moved the cycle onto the items; read the first one's window.
    const periodEnd = subscription?.items.data[0]?.current_period_end ?? null;

    // Best-effort and separately guarded: a customer with no upcoming invoice
    // (canceled, or never subscribed) makes this throw, which is an ordinary
    // state and must not cost us the rest of the summary.
    let nextInvoiceCents: number | null = null;
    if (options.includeNextInvoice ?? true) {
      try {
        const preview = await stripe.invoices.createPreview({
          customer: customerId,
        });
        nextInvoiceCents = preview.total;
      } catch {
        nextInvoiceCents = null;
      }
    }

    const paymentMethod =
      !("deleted" in customer && customer.deleted) &&
      customer.invoice_settings?.default_payment_method &&
      typeof customer.invoice_settings.default_payment_method !== "string"
        ? customer.invoice_settings.default_payment_method
        : null;

    return {
      subscription: subscription
        ? {
            status: subscription.status,
            amountCents,
            listAmountCents,
            currency,
            interval: price?.recurring?.interval ?? null,
            intervalCount: price?.recurring?.interval_count ?? 1,
            renewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            collection:
              subscription.collection_method === "send_invoice"
                ? "send_invoice"
                : "charge_automatically",
          }
        : null,
      card: paymentMethod?.card
        ? {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
          }
        : null,
      discount,
      nextInvoiceCents,
    };
  } catch {
    return null;
  }
}

/**
 * Stripe's discount, in the shape the console renders.
 *
 * Only the FIRST discount is mapped. Stripe allows several to stack, but a
 * page that showed one of three and implied it was the whole story would be
 * worse than one that showed none; the previewed next-invoice total remains
 * correct either way, and stacking is not something we issue.
 *
 * `applies_to.products` is what decides scope. A coupon restricted to the Pro
 * product reduces only the subscription; an unrestricted one also reduces the
 * metered overage that addUsageToInvoice attaches to the same invoice. Both
 * are deliberate choices we make per customer, so the scope is read rather
 * than assumed - see src/lib/discounts.ts. It arrives via `appliesToProducts`
 * because it is one expansion level past what the list call can carry.
 */
function mapDiscount(
  subscription: Stripe.Subscription | null,
  fallbackCurrency: string,
  appliesToProducts: string[],
): Discount | null {
  const raw = subscription?.discounts?.[0];
  if (!raw || typeof raw === "string") return null;

  const coupon = raw.source?.coupon;
  if (!coupon || typeof coupon === "string") return null;

  const percentOff = coupon.percent_off ?? null;
  const amountOffCents = coupon.amount_off ?? null;
  const currency = coupon.currency ?? fallbackCurrency;
  const restricted = appliesToProducts.length > 0;

  return {
    id: raw.id,
    label:
      coupon.name ?? describeDiscount({ percentOff, amountOffCents, currency }),
    percentOff,
    amountOffCents,
    currency,
    scope: restricted ? "subscription" : "all",
    endsAt: raw.end ? new Date(raw.end * 1000) : null,
    durationLabel: durationLabelFor(
      coupon.duration,
      coupon.duration_in_months ?? null,
    ),
  };
}

/** The coupon id behind a subscription's first discount, if any. */
function couponIdOf(subscription: Stripe.Subscription | null): string | null {
  const raw = subscription?.discounts?.[0];
  if (!raw || typeof raw === "string") return null;
  const coupon = raw.source?.coupon;
  if (!coupon) return null;
  return typeof coupon === "string" ? coupon : coupon.id;
}

/**
 * The product ids a coupon is restricted to, empty when it applies to
 * everything. `applies_to` is expandable and absent by default, so it takes
 * its own retrieve; best-effort, because a scope we cannot read should degrade
 * to "unrestricted" (what the customer sees) rather than break the page.
 */
async function couponAppliesToProducts(
  stripe: Stripe,
  couponId: string,
): Promise<string[]> {
  try {
    const coupon = await stripe.coupons.retrieve(couponId, {
      expand: ["applies_to"],
    });
    return coupon.applies_to?.products ?? [];
  } catch {
    return [];
  }
}
