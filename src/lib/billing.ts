import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";

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

/**
 * The Pro subscription price ($20/mo flat). Resolution order: explicit
 * STRIPE_PRO_PRICE_ID env, then lookup_key search, then create the product +
 * price on the fly (sandbox-friendly: a fresh Stripe account needs zero
 * manual setup).
 */
export async function ensureProPriceId(): Promise<string> {
  if (process.env.STRIPE_PRO_PRICE_ID) return process.env.STRIPE_PRO_PRICE_ID;
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
): Promise<void> {
  await db
    .update(organizations)
    .set({
      plan: "pro",
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
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
  const session = await getStripe().checkout.sessions.retrieve(
    checkoutSessionId,
  );
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
