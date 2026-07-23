"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { absoluteAppUrl } from "@/lib/absolute-url";
import { stripePriceForCheckout } from "@/lib/plan-catalog.server";
import {
  applyProSubscription,
  billingEnabled,
  ensureProPriceId,
  getStripe,
} from "@/lib/billing";

/**
 * Stripe Checkout for the Free -> Pro upgrade. The org's plan does NOT
 * change here: payment completes on Stripe's hosted page and the webhook
 * (/api/webhooks/stripe) flips the plan when checkout.session.completed
 * arrives. Customers are created lazily on first upgrade.
 */
export type CheckoutResult =
  { ok: true; url: string } | { ok: false; message: string };

export async function startProCheckout(
  orgSlug: string,
): Promise<CheckoutResult> {
  if (!billingEnabled()) {
    return { ok: false, message: "Billing isn't enabled on this deployment." };
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { ok: false, message: "Sign in required." };

  let org;
  try {
    org = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: requestHeaders,
    });
  } catch {
    return { ok: false, message: "Organization not found." };
  }
  if (!org) return { ok: false, message: "Organization not found." };

  const membership = org.members.find((m) => m.userId === session.user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return {
      ok: false,
      message: "Only organization owners can manage billing.",
    };
  }

  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  if (!row) return { ok: false, message: "Organization not found." };
  if (row.plan === "pro") {
    return { ok: false, message: "This organization is already on Pro." };
  }

  const stripe = getStripe();
  // Absolute, and correct on every surface: app.flagon.io/<org> in
  // production, http://localhost:3000/app/<org> locally.
  const orgUrl = await absoluteAppUrl(`/${org.slug}`);

  // Self-heal: if this org's customer already carries a live subscription
  // (e.g. a completed checkout whose webhook never arrived), apply it
  // instead of double-subscribing.
  if (row.stripeCustomerId) {
    const subs = await stripe.subscriptions.list({
      customer: row.stripeCustomerId,
      limit: 5,
    });
    const live = subs.data.find((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );
    if (live) {
      await applyProSubscription(org.id, row.stripeCustomerId, live.id);
      return { ok: true, url: `${orgUrl}?upgraded=1` };
    }
  }

  let customerId = row.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: session.user.email,
      metadata: { organization_id: org.id, organization_slug: org.slug ?? "" },
    });
    customerId = customer.id;
    await db
      .update(organizations)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
  }

  // The price book decides what Pro is sold at today (drizzle/0035), falling
  // back to the env var and then to lookup_key/auto-create. Whichever wins, the
  // price VERSION rides along in the subscription metadata so the webhook can
  // stamp it onto the org - that stamp is what later answers "who is on legacy
  // pricing?" without reconciling against Stripe.
  const book = await stripePriceForCheckout("pro");
  const priceId = book?.priceId ?? (await ensureProPriceId());

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: org.id,
    subscription_data: {
      metadata: {
        organization_id: org.id,
        ...(book?.planVersionId
          ? { flagon_plan_version_id: book.planVersionId }
          : {}),
      },
    },
    /**
     * Show the "Add promotion code" field.
     *
     * Without this there is no input at all: a customer holding a code has
     * nowhere to type it, and the only way to discount anyone is an operator
     * attaching a coupon to their subscription after the fact. That is fine for
     * a negotiated deal and useless for a launch promo.
     *
     * Stripe distinguishes a COUPON (the discount definition) from a PROMOTION
     * CODE (the redeemable string that points at one), and this flag accepts
     * promotion codes only - which is why sudo mints both.
     *
     * Note this is mutually exclusive with pre-applying `discounts` on the
     * session: Stripe rejects a session that does both. Self-serve upgrade is
     * the redeem-your-own-code path; operator-applied discounts go on the
     * subscription instead.
     */
    allow_promotion_codes: true,
    // {CHECKOUT_SESSION_ID} is substituted by Stripe; the org page uses it
    // to reconcile immediately on return, independent of webhook delivery.
    success_url: `${orgUrl}?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${orgUrl}?upgrade=canceled`,
  });

  if (!checkout.url) {
    return { ok: false, message: "Could not start checkout. Try again." };
  }
  return { ok: true, url: checkout.url };
}
