import { Hono } from "hono";
import type Stripe from "stripe";
import {
  getStripe,
  isBillingConfigured,
  STRIPE_WEBHOOK_SECRET,
} from "../../lib/stripe.js";
import {
  ensureMeteredItem,
  handleSubscriptionDeleted,
  orgForSubscription,
  syncSubscription,
} from "../../lib/billing.js";
import { handleInvoicePaidCredit } from "../../lib/billing-credits.js";
import { statusEntitlesPro } from "../../lib/entitlement.js";
import { reportOrgUsage } from "../../usage/report.js";
import { logger } from "../../lib/logger.js";
import { captureError } from "../../lib/monitoring.js";

/**
 * Best-effort: add the metered events item to an entitled sub that lacks it (self-heal
 * subs predating metered billing). Never breaks the plan sync — a missing metered
 * price (setup-metered not run) or Stripe error is logged and swallowed.
 */
async function selfHealMeteredItem(subscription: Stripe.Subscription): Promise<void> {
  if (!isBillingConfigured() || !statusEntitlesPro(subscription.status)) return;
  try {
    await ensureMeteredItem(subscription);
  } catch (err) {
    logger.warn("[stripe:webhook] ensureMeteredItem failed", { err });
  }
}

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
        await selfHealMeteredItem(subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        // Grant the period's $50 usage credit at creation + each renewal, idempotently.
        await handleInvoicePaidCredit(event.data.object as Stripe.Invoice);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        // Final flush: report the sub-5-min tail of usage BEFORE the status flip, while
        // the org still passes the metered-reportable gate. After the flip the sweep
        // skips the org forever — no metering against a dead subscription.
        const org = await orgForSubscription(subscription);
        if (org) {
          try {
            await reportOrgUsage(org);
          } catch (err) {
            // The sub is about to be un-metered forever; a dropped final flush is
            // permanently lost usage, so alert rather than just log.
            captureError("[stripe:webhook] final usage flush failed", err, {
              org: org.slug,
            });
          }
        }
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
    // A processing error (e.g. transient DB blip) SHOULD be retried by Stripe. We
    // return 500 (not throw), so this never reaches the request-boundary onError —
    // capture here or a webhook that keeps failing past Stripe's retry window is
    // invisible.
    captureError(`[stripe:webhook] handling ${event.type} failed`, err, {
      eventType: event.type,
    });
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
