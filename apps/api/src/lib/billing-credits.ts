import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { billingCreditGrants } from "../db/schema.js";
import { withOrg } from "../db/tenant.js";
import { getStripe } from "./stripe.js";
import { PRO_CREDIT_CENTS } from "./plans.js";
import { orgForSubscription, type BillingOrg } from "./billing.js";

/**
 * The $50 usage-credit lifecycle. Each billing period a Pro org is granted a $50
 * Stripe credit scoped to metered prices — the shared pool every metered product
 * draws from (invoice math: $50 base + max(0, usage − $50)). Grants do NOT auto-recur
 * in Stripe, so we issue one per period, driven by the subscription's renewal webhook.
 *
 * Idempotency (invariant: never double-grant on webhook redelivery) is enforced by
 * billing_credit_grants UNIQUE(org, period_key): only the INSERT that actually creates
 * the row is allowed to call Stripe. A row with a NULL stripe_grant_id means a prior
 * Stripe create failed after the row landed — the next trigger retries the create
 * without minting a second grant.
 */

/** The idempotency key for a billing cycle: the period-start date (YYYY-MM-DD). */
export function creditPeriodKey(periodStartUnix: number): string {
  return new Date(periodStartUnix * 1000).toISOString().slice(0, 10);
}

/**
 * Grace past period end that the credit stays valid. Metered usage bills in ARREARS,
 * so the period's invoice finalizes shortly AFTER period end; a credit that expired
 * exactly at period end would not apply to it (proven in test mode — validate-metered).
 * The grace is safely inside the next period, so the next cycle's fresh credit (not
 * this one) covers the next invoice — no double-crediting.
 */
const CREDIT_EXPIRY_GRACE_SECONDS = 3 * 24 * 60 * 60;

async function createStripeGrant(
  org: BillingOrg,
  periodEndUnix: number,
): Promise<string> {
  const stripe = getStripe();
  const grant = await stripe.billing.creditGrants.create({
    customer: org.stripeCustomerId!,
    amount: { type: "monetary", monetary: { currency: "usd", value: PRO_CREDIT_CENTS } },
    // Scope to ALL metered prices (price_type), so the one $50 credit is the shared
    // pool across every product's meter — not tied to a single price id.
    applicability_config: { scope: { price_type: "metered" } },
    // Paid: the customer funds it via the $50 base line. (Tracking only.)
    category: "paid",
    // effective_at defaults to now (Stripe rejects a past timestamp; on renewal the
    // grant fires just after period start). expires_at = period end + grace so the
    // credit is still valid when the arrears invoice finalizes.
    expires_at: periodEndUnix + CREDIT_EXPIRY_GRACE_SECONDS,
  });
  return grant.id;
}

/**
 * Ensure the org's $50 credit exists for the given billing period, exactly once.
 * No-ops (no Stripe call) if the period was already granted. Requires a Stripe
 * customer; a comped org gets the grant too (harmless — the 100%-off coupon zeroes
 * the invoice before credits apply).
 */
export async function grantPeriodCredit(
  org: BillingOrg,
  opts: { periodStartUnix: number; periodEndUnix: number },
): Promise<{ granted: boolean; stripeGrantId: string | null }> {
  if (!org.stripeCustomerId) return { granted: false, stripeGrantId: null };
  const periodKey = creditPeriodKey(opts.periodStartUnix);

  // Claim the period. Only the winning INSERT may call Stripe.
  const inserted = await withOrg(org.id, (tx) =>
    tx
      .insert(billingCreditGrants)
      .values({ organizationId: org.id, periodKey, amountCents: PRO_CREDIT_CENTS })
      .onConflictDoNothing({
        target: [billingCreditGrants.organizationId, billingCreditGrants.periodKey],
      })
      .returning({ id: billingCreditGrants.id }),
  );

  if (inserted.length > 0) {
    const stripeGrantId = await createStripeGrant(org, opts.periodEndUnix);
    await withOrg(org.id, (tx) =>
      tx
        .update(billingCreditGrants)
        .set({ stripeGrantId })
        .where(eq(billingCreditGrants.id, inserted[0]!.id)),
    );
    return { granted: true, stripeGrantId };
  }

  // Row already existed. If a prior Stripe create was owed (grant id still NULL),
  // retry it now without minting a second grant.
  const [owed] = await withOrg(org.id, (tx) =>
    tx
      .select({ id: billingCreditGrants.id })
      .from(billingCreditGrants)
      .where(
        and(
          eq(billingCreditGrants.organizationId, org.id),
          eq(billingCreditGrants.periodKey, periodKey),
          isNull(billingCreditGrants.stripeGrantId),
        ),
      ),
  );
  if (owed) {
    const stripeGrantId = await createStripeGrant(org, opts.periodEndUnix);
    await withOrg(org.id, (tx) =>
      tx
        .update(billingCreditGrants)
        .set({ stripeGrantId })
        .where(eq(billingCreditGrants.id, owed.id)),
    );
    return { granted: true, stripeGrantId };
  }

  return { granted: false, stripeGrantId: null };
}

/** A Stripe subscription's current billing period as unix seconds (from item 0). */
export function subscriptionPeriod(
  subscription: Stripe.Subscription,
): { periodStartUnix: number; periodEndUnix: number } | null {
  const item = subscription.items.data[0];
  if (!item) return null;
  return {
    periodStartUnix: item.current_period_start,
    periodEndUnix: item.current_period_end,
  };
}

/**
 * Grant the period's $50 credit when a subscription invoice is PAID — at creation and
 * each renewal — so the credit exists before that period's arrears usage finalizes.
 * Idempotent per period (grantPeriodCredit). Fired from the webhook on
 * invoice.paid / invoice.payment_succeeded. In this API version the invoice's
 * subscription is at `invoice.parent.subscription_details.subscription`.
 */
export async function handleInvoicePaidCredit(
  invoice: Stripe.Invoice,
): Promise<void> {
  const reason = invoice.billing_reason;
  if (reason !== "subscription_create" && reason !== "subscription_cycle") return;

  const subRef = invoice.parent?.subscription_details?.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subId) return;

  const subscription = await getStripe().subscriptions.retrieve(subId);
  const org = await orgForSubscription(subscription);
  if (!org) return;
  const period = subscriptionPeriod(subscription);
  if (!period) return;

  await grantPeriodCredit(org, period);
}
