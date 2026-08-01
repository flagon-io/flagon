import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { getStripe, getProPriceId } from "./stripe.js";
import { statusEntitlesPro } from "./entitlement.js";

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
 * manage) a $20/mo Pro subscription, and return its URL. The price is resolved
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
  const customerId = await ensureCustomer(org, actor);
  const base = `${appUrl()}/${org.slug}/settings/billing`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
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
async function resolveOrg(
  subscription: Stripe.Subscription,
): Promise<BillingOrg | null> {
  const byMeta = subscription.metadata?.flagon_org_id;
  if (byMeta) {
    const rows = await db
      .select(billingColumns)
      .from(organizations)
      .where(eq(organizations.id, byMeta))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const customerId = customerIdOf(subscription.customer);
  if (customerId) {
    const rows = await db
      .select(billingColumns)
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customerId))
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
