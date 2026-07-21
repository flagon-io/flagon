import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { apiError, apiJson } from "@/lib/api";
import {
  addUsageToInvoice,
  applyProSubscription,
  billingEnabled,
  getStripe,
  subscriptionCycle,
} from "@/lib/billing";
import { invoiceUsageWindow } from "@/lib/billing-period";
import {
  closePeriod,
  getPeriod,
  markInvoiced,
  totalsFromSnapshot,
} from "@/lib/billing-periods.server";
import { withInvoiceClaim } from "@/lib/invoice-claims.server";
import { PLANS, isPlanId, usageIsAutoInvoiced } from "@/lib/plans";
import { buildUsageInvoiceLines } from "@/lib/usage-invoice";
import { clearPlanCache } from "@/lib/usage-events.server";

/**
 * Stripe webhook: the single source of plan transitions, and where a period's
 * usage becomes invoice lines. Checkout completion flips an org to Pro;
 * subscription cancellation/expiry drops it back to free; a newly opened
 * invoice gets the usage for the cycle that just ENDED. Signature-verified
 * with STRIPE_WEBHOOK_SECRET (from `stripe listen` locally, or the dashboard
 * endpoint in production). Infra endpoint - not part of the public API
 * contract.
 */
export async function POST(request: Request) {
  if (!billingEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return apiError(503, "billing_not_configured", "Stripe is not configured.");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return apiError(
      400,
      "missing_signature",
      "Missing stripe-signature header.",
    );
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
    return apiError(
      400,
      "invalid_signature",
      "Webhook signature verification failed.",
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.client_reference_id;
      if (orgId && session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;
        // Retrieve the subscription for its cycle: this is the org's billing
        // window from now on, and the usage page has to agree with it.
        let cycle: { start: Date; end: Date } | null = null;
        if (subscriptionId) {
          const subscription =
            await getStripe().subscriptions.retrieve(subscriptionId);
          cycle = subscriptionCycle(subscription);
        }
        await applyProSubscription(
          orgId,
          typeof session.customer === "string" ? session.customer : null,
          subscriptionId,
          cycle,
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
        const cycle = active ? subscriptionCycle(subscription) : null;
        await db
          .update(organizations)
          .set({
            plan: active ? "pro" : "free",
            stripeSubscriptionId: active ? subscription.id : null,
            // A cancelled subscription has no cycle: fall back to the
            // calendar month rather than freezing on a stale window.
            currentPeriodStart: cycle?.start ?? null,
            currentPeriodEnd: cycle?.end ?? null,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId));
        clearPlanCache(orgId);
      }
      break;
    }

    /**
     * A draft invoice was opened. Attach the usage for the cycle that just
     * ended, priced from the frozen snapshot.
     *
     * The window is deliberately NOT the invoice's own period. A recurring
     * invoice's period is the service window it is OPENING, so billing usage
     * against it would charge an empty future range forever. Usage is billed
     * in arrears: the cycle up to the day before this one starts.
     */
    case "invoice.created": {
      const invoice = event.data.object;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId || invoice.status !== "draft" || !invoice.id) break;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.stripeCustomerId, customerId))
        .limit(1);
      if (!org) break;

      // The invoice's OWN period is the cycle that just ended (its line items
      // carry the upcoming one). A subscription_create invoice covers no
      // elapsed time at all and yields null.
      const window = invoiceUsageWindow({
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
      });
      if (!window) break;

      // Freeze the window before billing it: the snapshot is what gets
      // invoiced, and its status is what makes this exactly-once.
      const period = await closePeriod({
        orgId: org.id,
        window,
        plan: org.plan,
      });
      if (period.status === "invoiced") break;

      const planId = isPlanId(period.plan) ? period.plan : "free";

      /**
       * Contracted plans are invoiced by agreement, not by this handler.
       *
       * The org is matched by stripe_customer_id alone, so an enterprise org
       * with a Stripe customer attached - the natural thing to do when setting
       * up their subscription - would otherwise have a full period of usage
       * added on top of the fee that was supposed to cover it.
       *
       * The period is still CLOSED above, deliberately: the frozen snapshot is
       * what a contract review and any true-up are computed from, so it has to
       * exist even though nothing is attached to the invoice here.
       */
      if (!usageIsAutoInvoiced(planId)) break;

      const snapshot = await getPeriod({
        orgId: org.id,
        periodStart: period.periodStart,
      });
      if (!snapshot) break;

      const totals = totalsFromSnapshot(snapshot.period, snapshot.lines);
      const lines = buildUsageInvoiceLines(totals, {
        planName: PLANS[planId].name,
        period: { from: period.periodStart, to: period.periodEnd },
      });

      /**
       * Claim the invoice before touching Stripe.
       *
       * The period-status check above is not enough on its own: Stripe retries
       * webhooks and can deliver this event twice CONCURRENTLY, in which case
       * both deliveries read 'closed' and both attach the same usage. The
       * claim is an expiring lease, so a delivery that dies mid-call does not
       * wedge the invoice - the next one retries it. "skipped" means another
       * delivery is doing (or has done) the work, which is a success.
       */
      await withInvoiceClaim(
        {
          orgId: org.id,
          stripeInvoiceId: invoice.id,
          billingPeriodId: period.id,
        },
        async () => {
          await addUsageToInvoice({ invoiceId: invoice.id, customerId, lines });
          await markInvoiced({
            orgId: org.id,
            periodId: period.id,
            stripeInvoiceId: invoice.id,
          });
        },
      );
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
            currentPeriodStart: null,
            currentPeriodEnd: null,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId));
        clearPlanCache(orgId);
      }
      break;
    }
    default:
      break;
  }

  return apiJson({ received: true });
}
