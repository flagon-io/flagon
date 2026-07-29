import { Hono } from "hono";
import type Stripe from "stripe";
import { getStripe, STRIPE_WEBHOOK_SECRET } from "../../lib/stripe.js";
import {
  handleSubscriptionDeleted,
  syncSubscription,
} from "../../lib/billing.js";
import { logger } from "../../lib/logger.js";

/**
 * Stripe webhook. Mounted at /webhooks/stripe — deliberately OUTSIDE /v1, with
 * no auth-context, org resolution, or management rate limit: Stripe authenticates
 * itself by signing the request body, which we verify against the signing secret.
 *
 * Stripe is the source of truth; this is the only inbound path that flips an
 * org's plan on a payment event. We always return 2xx for a handled/ignored
 * event so Stripe stops retrying, reserving 4xx/5xx for "could not verify or
 * process", which Stripe SHOULD retry.
 */
export const stripeWebhook = new Hono();

stripeWebhook.post("/", async (c) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.error("[stripe:webhook] STRIPE_WEBHOOK_SECRET is not set");
    return c.text("Billing webhook not configured.", 503);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.text("Missing stripe-signature header.", 400);

  // Raw body is required for signature verification; do not parse first.
  const payload = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.error("[stripe:webhook] signature verification failed", { err });
    return c.text("Invalid signature.", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await getStripe().subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id,
          );
          logResult(event.type, await syncSubscription(subscription), subscription.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logResult(event.type, await syncSubscription(subscription), subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logResult(
          event.type,
          await handleSubscriptionDeleted(subscription),
          subscription.id,
        );
        break;
      }
      default:
        break; // Unhandled event types are acknowledged and ignored.
    }
  } catch (err) {
    // A processing error (e.g. transient DB blip) SHOULD be retried by Stripe.
    logger.error(`[stripe:webhook] handling ${event.type} failed`, { err });
    return c.text("Webhook handler error.", 500);
  }

  return c.body(null, 200);
});

function logResult(type: string, orgId: string | null, subId: string) {
  if (orgId) {
    logger.info(`[stripe:webhook] ${type}: synced org ${orgId} (${subId})`);
  } else {
    logger.warn(`[stripe:webhook] ${type}: no org matched subscription ${subId}`);
  }
}
