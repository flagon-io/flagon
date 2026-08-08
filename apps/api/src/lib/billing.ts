import type Stripe from "stripe";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { checks } from "../db/schema.js";
import { withOrg } from "../db/tenant.js";
import {
  getStripe,
  getProPriceId,
  getMeteredPriceIds,
  UPTIME_MONITORS_METER_EVENT_NAME,
} from "./stripe.js";
import { statusEntitlesPro, isMeteredReportable } from "./entitlement.js";
import { captureError } from "./monitoring.js";
import type { BillingCycle } from "../usage/allowance.js";

/**
 * The billing service: everything that talks to Stripe about an organization's
 * Pro subscription. The API owns this (the console renders screens and calls the
 * billing endpoints). The org keeps only three columns
 * (stripe_customer_id / stripe_subscription_id / subscription_status); Stripe
 * owns the rest (price, discounts, card, invoices).
 *
 * Subscription state flows ONE way: Stripe -> webhook -> `syncSubscription`.
 * `organizations.plan` is a cache of entitlement the rest of the platform reads
 * cheaply; only the webhook (and the reconciliation backfill) writes it.
 *
 * These rows live in the auth schema (owned by the console's migration) but have
 * no RLS, and the restricted API role holds UPDATE — the same way the API
 * already stamps access_tokens.last_used_at.
 */

export type BillingOrg = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

const billingColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  plan: organizations.plan,
  stripeCustomerId: organizations.stripeCustomerId,
  stripeSubscriptionId: organizations.stripeSubscriptionId,
  subscriptionStatus: organizations.subscriptionStatus,
};

/** The console origin, for building checkout/portal return URLs. */
function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3001";
}

/** Load one org's billing row by id. */
export async function getBillingOrgById(
  id: string,
): Promise<BillingOrg | null> {
  const rows = await db
    .select(billingColumns)
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The org's Stripe Customer id, creating the Customer on first use and storing
 * it. Idempotent: an org already linked to a customer returns it unchanged, so
 * we never spawn a second customer (which would fork the billing history and
 * lose an existing discount).
 */
export async function ensureCustomer(
  org: BillingOrg,
  actor: { email?: string | null; name?: string | null },
): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    // An org-token caller has no user email; Stripe's email is optional.
    ...(actor.email ? { email: actor.email } : {}),
    metadata: { flagon_org_id: org.id, flagon_org_slug: org.slug },
  });

  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));

  return customer.id;
}

/**
 * Create a Checkout Session to start (or, when a live subscription exists,
 * manage) a $50/mo Pro subscription, and return its URL. The price is resolved
 * from its stable lookup key, so no price id is configured. The org id rides on
 * `client_reference_id` and the subscription metadata for unambiguous webhook
 * attribution.
 */
export async function createCheckoutUrl(
  org: BillingOrg,
  actor: { email?: string | null; name?: string | null },
): Promise<string> {
  const stripe = getStripe();
  const priceId = await getProPriceId();
  const meteredPriceIds = await getMeteredPriceIds();
  const customerId = await ensureCustomer(org, actor);
  const base = `${appUrl()}/${org.slug}/settings/billing`;

  // The flat $50 base + one metered item per meter — events, browser check runs, AND the
  // uptime-monitors gauge (getMeteredPriceIds includes all of them). Metered items carry
  // NO quantity (usage flows via each meter; the shared $50 credit offsets every one),
  // so every billing line is present from day one and reads plainly by its product name.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
    ...meteredPriceIds.map((price) => ({ price })),
  ];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    client_reference_id: org.id,
    subscription_data: {
      metadata: { flagon_org_id: org.id, flagon_org_slug: org.slug },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: `${base}?checkout=success`,
    cancel_url: `${base}?checkout=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

/** The org's count of ACTIVE uptime monitors — the metered gauge value. Muted monitors
 *  still run (and bill); deactivated ones don't. The one product-table read billing does,
 *  for the count-billed uptime unit. */
export async function activeUptimeMonitorCount(orgId: string): Promise<number> {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(checks)
      .where(and(eq(checks.family, "uptime"), eq(checks.activated, true))),
  );
  return rows[0]?.n ?? 0;
}

/**
 * Ensure a subscription carries every metered billing item the code declares — one per
 * meter (events, browser check runs, uptime monitors). Idempotent — new checkouts include
 * these already; this self-heals subscriptions that predate a meter (the flat-price +
 * comped subs, or any that lost one). Metered items carry no quantity; usage flows via
 * each meter and the shared $50 credit offsets it.
 */
export async function ensureBillingItems(subscription: Stripe.Subscription): Promise<void> {
  const stripe = getStripe();
  const meteredIds = await getMeteredPriceIds();
  for (const priceId of meteredIds) {
    if (subscription.items.data.some((it) => it.price?.id === priceId)) continue;
    await stripe.subscriptionItems.create({ subscription: subscription.id, price: priceId });
  }
}

/**
 * Report the org's current active-uptime-monitor COUNT to the uptime meter — a GAUGE:
 * Stripe's `last` aggregation bills the last value reported in the period, so reporting
 * the count each usage sweep keeps the billed count current (and prices monitors from #1,
 * drawing down the shared $50 credit). Only a billable (entitled) Pro org is reported.
 * Best-effort: never throws — a Stripe hiccup just leaves the previous value until the
 * next sweep.
 */
export async function reportUptimeUsage(org: BillingOrg): Promise<void> {
  if (!isMeteredReportable(org)) return;
  try {
    const count = await activeUptimeMonitorCount(org.id);
    await getStripe().billing.meterEvents.create({
      event_name: UPTIME_MONITORS_METER_EVENT_NAME,
      payload: { stripe_customer_id: org.stripeCustomerId!, value: String(count) },
    });
  } catch (err) {
    captureError(`[billing] reportUptimeUsage org ${org.slug} failed`, err, { org: org.slug });
  }
}

/** Create a Billing Portal session and return its URL. */
export async function createPortalUrl(org: BillingOrg): Promise<string> {
  if (!org.stripeCustomerId) {
    throw new Error("This organization has no Stripe customer to manage.");
  }
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl()}/${org.slug}/settings/billing`,
  });
  return session.url;
}

export type BillingSummary = {
  /** The Stripe subscription status ("active", "trialing", "past_due", ...). */
  status: string;
  /** Current period end, ISO; null if unknown. */
  currentPeriodEnd: string | null;
  /** Whether the subscription is set to end at the current period. */
  cancelAtPeriodEnd: boolean;
  /**
   * The active discount, if any. A comped org carries a 100%-off coupon here, which
   * is exactly what the console reads to say "on Pro at no charge". null = paying
   * the full rate.
   */
  discount: {
    name: string | null;
    /** 0-100; 100 means fully comped. Null when the coupon is a fixed amount. */
    percentOff: number | null;
    /** Fixed amount off in cents; null when the coupon is a percentage. */
    amountOffCents: number | null;
    /** When a `repeating` discount ends, ISO; null for a `forever`/`once` coupon. */
    endsAt: string | null;
  } | null;
};

/**
 * The org's live subscription summary, read from Stripe for the billing page. This
 * is how the console can be UNMISTAKABLE that a comped org isn't being charged: the
 * comp is a real subscription carrying a 100%-off coupon, and this surfaces that
 * discount. Returns null when the org has no Stripe subscription (free Hobby, or a
 * manually-granted null-status Pro). In this API version `current_period_end` lives
 * on the subscription items and each discount's coupon at `discount.source.coupon`,
 * so we expand and read accordingly.
 */
export async function getBillingSummary(
  org: BillingOrg,
): Promise<BillingSummary | null> {
  if (!org.stripeSubscriptionId) return null;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId, {
    expand: ["discounts.source.coupon"],
  });

  const iso = (unix: number | null | undefined) =>
    typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;

  // The first coupon-backed discount. A comp is a single 100%-off coupon; each
  // discount's coupon lives at discount.source.coupon in this API version.
  let discount: BillingSummary["discount"] = null;
  for (const d of sub.discounts) {
    if (typeof d === "string") continue; // unexpanded id — skip defensively
    const coupon = d.source?.coupon;
    if (coupon && typeof coupon !== "string") {
      discount = {
        name: coupon.name,
        percentOff: coupon.percent_off,
        amountOffCents: coupon.amount_off,
        endsAt: iso(d.end),
      };
      break;
    }
  }

  return {
    status: sub.status,
    currentPeriodEnd: iso(sub.items.data[0]?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    discount,
  };
}

/** First-of-month → end-of-month (UTC) as day strings — the billing cycle for an org
 *  with no active Stripe subscription (free Hobby). */
function calendarMonthCycle(atMs = Date.now()): BillingCycle {
  const now = new Date(atMs);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    to: day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))),
    source: "calendar",
  };
}

/** Per-org cache of the resolved billing cycle. The cycle only changes MONTHLY, so a
 *  few minutes of caching makes the usage page cheap (no Stripe round-trip per load,
 *  which measured ~3s) and robust; the worst staleness is one TTL at a cycle boundary.
 *  Error fallbacks are deliberately NOT cached so a transient Stripe hiccup doesn't
 *  pin an org to the calendar-month window for the whole TTL. */
const cycleCache = new Map<string, { cycle: BillingCycle; expiresAt: number }>();
const CYCLE_TTL_MS = 10 * 60_000;
const STRIPE_CYCLE_TIMEOUT_MS = 2500;

/** Reject if `p` hasn't settled within `ms` — bounds a slow Stripe call so it can
 *  never hang the usage page (the caller then falls back to the calendar month). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("stripe timeout")), ms),
    ),
  ]);
}

/**
 * The org's ACTUAL billing cycle for the usage page: the Stripe subscription's current
 * period (e.g. the 24th → the 24th) when the org has an entitling subscription, else the
 * calendar month. This is what makes the console's "included events this cycle" and the
 * consumption chart line up with the customer's real invoice window instead of the
 * calendar month. Resilient: no subscription, a non-entitling status, or any Stripe error
 * or timeout all fall back to the calendar month so the usage page never hangs or breaks.
 * Cached per org (the cycle changes monthly) so it's not a Stripe round-trip every load.
 * In this API version the period lives on the subscription ITEM (`current_period_*`).
 */
export async function billingCycle(orgId: string, nowMs = Date.now()): Promise<BillingCycle> {
  const hit = cycleCache.get(orgId);
  if (hit && hit.expiresAt > nowMs) return hit.cycle;
  const cache = (cycle: BillingCycle): BillingCycle => {
    cycleCache.set(orgId, { cycle, expiresAt: nowMs + CYCLE_TTL_MS });
    return cycle;
  };

  const org = await getBillingOrgById(orgId);
  if (!org?.stripeSubscriptionId) return cache(calendarMonthCycle(nowMs));
  try {
    const sub = await withTimeout(
      getStripe().subscriptions.retrieve(org.stripeSubscriptionId),
      STRIPE_CYCLE_TIMEOUT_MS,
    );
    if (!statusEntitlesPro(sub.status)) return cache(calendarMonthCycle(nowMs));
    const item = sub.items.data[0];
    const start = item?.current_period_start;
    const end = item?.current_period_end;
    if (typeof start !== "number" || typeof end !== "number") {
      return cache(calendarMonthCycle(nowMs));
    }
    const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
    return cache({ from: day(start), to: day(end), source: "stripe" });
  } catch {
    // Transient Stripe failure/timeout: fall back WITHOUT caching, so the next load
    // retries instead of showing the calendar month for the whole TTL.
    return calendarMonthCycle(nowMs);
  }
}

/** Resolve a customer id from Stripe's `string | Customer | DeletedCustomer`. */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Find the org a Stripe subscription belongs to. Prefers the org id stamped into
 * the subscription metadata (set on every checkout we create); falls back to
 * matching the stored customer id, which is how a subscription created OUTSIDE
 * our checkout (a pre-existing dashboard one) attaches after backfill.
 */
/** Resolve the org a Stripe subscription belongs to (metadata, then customer id). */
export function orgForSubscription(
  subscription: Stripe.Subscription,
): Promise<BillingOrg | null> {
  return resolveOrg(subscription);
}

async function resolveOrg(
  subscription: Stripe.Subscription,
): Promise<BillingOrg | null> {
  // A soft-deleted org's billing is frozen: skip it so a late/adversarial Stripe
  // event can't flip its status back to entitling and re-arm usage reporting.
  const byMeta = subscription.metadata?.flagon_org_id;
  if (byMeta) {
    const rows = await db
      .select(billingColumns)
      .from(organizations)
      .where(and(eq(organizations.id, byMeta), isNull(organizations.deletedAt)))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const customerId = customerIdOf(subscription.customer);
  if (customerId) {
    const rows = await db
      .select(billingColumns)
      .from(organizations)
      .where(and(eq(organizations.stripeCustomerId, customerId), isNull(organizations.deletedAt)))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  return null;
}

/**
 * Apply a Stripe subscription's current state to its org. Plan transitions are
 * one-directional: enterprise is never touched (granted out-of-band); an
 * entitling status grants/keeps Pro; a non-entitling status keeps the current
 * plan (a Pro org stays Pro and LOCKS via its status, rather than silently
 * becoming a usable free Hobby). Returns the org id, or null if unmatched.
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const org = await resolveOrg(subscription);
  if (!org) return null;

  const entitled = statusEntitlesPro(subscription.status);
  const nextPlan =
    org.plan === "enterprise" ? "enterprise" : entitled ? "pro" : org.plan;

  await db
    .update(organizations)
    .set({
      stripeCustomerId:
        customerIdOf(subscription.customer) ?? org.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      plan: nextPlan,
    })
    .where(eq(organizations.id, org.id));

  return org.id;
}

/**
 * A settlement snapshot for the delete flow: what the org still owes and whether
 * it's safe to delete without leaving money on the table. `owedCents` folds the
 * remaining balance on OPEN (finalized, unpaid) invoices plus any positive Stripe
 * customer balance (a pending debit). `hasActiveSubscription` means a live sub is
 * still accruing usage that hasn't been invoiced. `clear` = nothing owed and no
 * active subscription — safe to delete. `blocked` = there are open UNPAID invoices
 * (an existing debt), which we refuse to let deletion escape.
 */
export type Settlement = {
  hasActiveSubscription: boolean;
  openInvoiceCount: number;
  owedCents: number;
  clear: boolean;
  blocked: boolean;
};

/** Sum the still-owed cents across a customer's OPEN (finalized, unpaid) invoices. */
async function openInvoices(
  stripe: Stripe,
  customerId: string,
): Promise<{ count: number; owedCents: number }> {
  const list = await stripe.invoices.list({ customer: customerId, status: "open", limit: 100 });
  const owedCents = list.data.reduce((sum, inv) => sum + (inv.amount_remaining ?? 0), 0);
  return { count: list.data.length, owedCents };
}

/**
 * Read-only settlement snapshot for the org (drives the Danger Zone preview). Never
 * mutates Stripe. An org with no customer owes nothing and is immediately clear.
 */
export async function getSettlement(org: BillingOrg): Promise<Settlement> {
  if (!org.stripeCustomerId) {
    return { hasActiveSubscription: false, openInvoiceCount: 0, owedCents: 0, clear: true, blocked: false };
  }
  const stripe = getStripe();
  const [open, customer] = await Promise.all([
    openInvoices(stripe, org.stripeCustomerId),
    stripe.customers.retrieve(org.stripeCustomerId),
  ]);
  // A positive Stripe customer balance is a pending debit owed on the next invoice.
  const balanceOwed =
    customer && !customer.deleted && typeof customer.balance === "number"
      ? Math.max(0, customer.balance)
      : 0;
  const hasActiveSubscription =
    !!org.stripeSubscriptionId && statusEntitlesPro(org.subscriptionStatus);
  const owedCents = open.owedCents + balanceOwed;
  return {
    hasActiveSubscription,
    openInvoiceCount: open.count,
    owedCents,
    clear: owedCents === 0 && !hasActiveSubscription,
    blocked: open.count > 0,
  };
}

/**
 * SETTLE the org for deletion: cancel the subscription IMMEDIATELY, invoicing the
 * accrued metered usage now (`invoice_now` + `prorate`) so nothing goes unbilled,
 * then force-collect every open invoice from the payment method on file. Returns
 * the resulting settlement — `clear` only when no open invoice remains. Idempotent:
 * safe to call when there's no subscription (it just collects any open invoices).
 * The caller must NOT delete unless the returned settlement is `clear`.
 */
export async function settleAndCancel(org: BillingOrg): Promise<Settlement> {
  if (!org.stripeCustomerId) {
    return { hasActiveSubscription: false, openInvoiceCount: 0, owedCents: 0, clear: true, blocked: false };
  }
  const stripe = getStripe();

  // 1. Cancel the live subscription, finalizing accrued usage into a final invoice.
  //    Track whether it is CONFIRMED gone: only then may we treat it as canceled in
  //    the re-check below. If the cancel threw on a live sub, we must NOT assume it
  //    canceled (it could still be billing) — leave it active so `clear` stays false
  //    and deletion is refused (safe: we never delete an org whose sub still bills).
  let subscriptionCanceled = !org.stripeSubscriptionId;
  if (org.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      if (sub.status === "canceled") {
        subscriptionCanceled = true;
      } else {
        await stripe.subscriptions.cancel(org.stripeSubscriptionId, {
          invoice_now: true,
          prorate: true,
        });
        subscriptionCanceled = true;
      }
    } catch (err) {
      // Couldn't confirm cancellation — leave subscriptionCanceled false (blocks delete).
      console.error("[billing] settleAndCancel: cancel failed:", err);
    }
  }

  // 2. Force-collect every open invoice from the card on file (best-effort each).
  const open = await stripe.invoices.list({ customer: org.stripeCustomerId, status: "open", limit: 100 });
  for (const inv of open.data) {
    if (!inv.id) continue;
    try {
      await stripe.invoices.pay(inv.id);
    } catch (err) {
      console.error(`[billing] settleAndCancel: pay invoice ${inv.id} failed:`, err);
    }
  }

  // 3. Re-read the settlement AFTER cancel + collection. The org row's subscription
  //    status is only refreshed by the webhook (a later request), so reflect the
  //    just-confirmed cancel LOCALLY before re-checking — otherwise the stale
  //    "active" status keeps hasActiveSubscription true and clear false forever.
  //    owedCents still comes from LIVE Stripe reads, so a real unpaid balance still
  //    blocks; only the subscription-liveness bit is corrected.
  const fresh = (await getBillingOrgById(org.id)) ?? org;
  const local = subscriptionCanceled
    ? { ...fresh, subscriptionStatus: "canceled", stripeSubscriptionId: null }
    : fresh;
  return getSettlement(local);
}

/**
 * Handle a fully-deleted subscription: clear the subscription link and mark it
 * canceled. The org KEEPS its Pro plan and locks; the customer id is retained so
 * a later resubscribe reuses the same billing history.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const org = await resolveOrg(subscription);
  if (!org) return null;

  await db
    .update(organizations)
    .set({
      stripeSubscriptionId: null,
      subscriptionStatus: "canceled",
    })
    .where(eq(organizations.id, org.id));

  return org.id;
}
