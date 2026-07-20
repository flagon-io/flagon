import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { apiError, apiJson } from "@/lib/api";
import { applyProSubscription, billingEnabled, getStripe } from "@/lib/billing";

/**
 * Stripe webhook: the single source of plan transitions. Checkout completion
 * flips an org to Pro; subscription cancellation/expiry drops it back to
 * free. Signature-verified with STRIPE_WEBHOOK_SECRET (from `stripe listen`
 * locally, or the dashboard endpoint in production). Infra endpoint - not
 * part of the public API contract.
 */
export async function POST(request: Request) {
  if (!billingEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return apiError(503, "billing_not_configured", "Stripe is not configured.");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return apiError(400, "missing_signature", "Missing stripe-signature header.");
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return apiError(400, "invalid_signature", "Webhook signature verification failed.");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.client_reference_id;
      if (orgId && session.mode === "subscription") {
        await applyProSubscription(
          orgId,
          typeof session.customer === "string" ? session.customer : null,
          typeof session.subscription === "string"
            ? session.subscription
            : null,
        );
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const orgId = subscription.metadata?.organization_id;
      if (orgId) {
        const active = ["active", "trialing", "past_due"].includes(
          subscription.status,
        );
        await db
          .update(organizations)
          .set({
            plan: active ? "pro" : "free",
            stripeSubscriptionId: active ? subscription.id : null,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const orgId = subscription.metadata?.organization_id;
      if (orgId) {
        await db
          .update(organizations)
          .set({
            plan: "free",
            stripeSubscriptionId: null,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId));
      }
      break;
    }
    default:
      break;
  }

  return apiJson({ received: true });
}
