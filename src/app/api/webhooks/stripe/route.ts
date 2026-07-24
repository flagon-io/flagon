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
import {
  PLANS,
  isPlanId,
  planAutoInvoicesAnything,
  subscriptionPlan,
} from "@/lib/plans";
import { buildUsageInvoiceLines } from "@/lib/usage-invoice";
import { clearPlanCache } from "@/lib/usage-events.server";

/**
 * Stripe webhook: the single source of plan transitions, and where a period's
 * usage becomes invoice lines. Checkout completion flips an org to Pro; a
 * subscription update keeps the org on Pro and syncs its cycle; cancellation or
 * expiry drops it back to free; a newly opened invoice gets the usage for the
 * cycle that just ENDED. Signature-verified
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
        let planVersionId: string | null = null;
        if (subscriptionId) {
          const subscription =
            await getStripe().subscriptions.retrieve(subscriptionId);
          cycle = subscriptionCycle(subscription);
          // The version this was sold at, so the grandfathering pin is set from
          // the very first webhook rather than a later subscription.updated.
          planVersionId = subscription.metadata?.flagon_plan_version_id ?? null;
        }
        await applyProSubscription(
          orgId,
          typeof session.customer === "string" ? session.customer : null,
          subscriptionId,
          cycle,
          planVersionId,
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
        // Any active subscription resolves to Pro (the one billable plan).
        // The price VERSION this subscription was sold at, declared by whoever
        // created it (Checkout, or the operator console). Only ever SET, never
        // cleared on cancellation: which price a customer bought is history,
        // and a resubscribe should not silently land them on current pricing.
        const declaredVersion = subscription.metadata?.flagon_plan_version_id;

        await db
          .update(organizations)
          .set({
            plan: active ? subscriptionPlan(subscription.metadata) : "free",
            stripeSubscriptionId: active ? subscription.id : null,
            ...(declaredVersion ? { planVersionId: declaredVersion } : {}),
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
      // carry the upcoming one), so it IS the arrears window.
      let window =
        typeof invoice.period_start === "number" &&
        typeof invoice.period_end === "number"
          ? invoiceUsageWindow({
              periodStart: new Date(invoice.period_start * 1000),
              periodEnd: new Date(invoice.period_end * 1000),
            })
          : null;

      // Fallback: Stripe is moving the service period off the invoice and onto
      // its line items. If the top-level bounds are gone, reconstruct the
      // arrears cycle from the first line's FUTURE period - arrears is the cycle
      // immediately before it (one cycle length back). Renewals only: a
      // subscription_create invoice has no elapsed cycle to bill, and deriving
      // one would close a phantom pre-signup period.
      if (!window && invoice.billing_reason === "subscription_cycle") {
        const line = invoice.lines?.data?.[0];
        const futureStart = line?.period?.start;
        const futureEnd = line?.period?.end;
        if (
          typeof futureStart === "number" &&
          typeof futureEnd === "number" &&
          futureEnd > futureStart
        ) {
          const cycleMs = (futureEnd - futureStart) * 1000;
          window = invoiceUsageWindow({
            periodStart: new Date(futureStart * 1000 - cycleMs),
            periodEnd: new Date(futureStart * 1000),
          });
        }
      }
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
       * Hobby is never invoiced. Pro is - the period stays CLOSED regardless
       * (the frozen snapshot is what any true-up reads), but only Pro gets
       * lines attached here.
       */
      if (!planAutoInvoicesAnything(planId)) break;

      const snapshot = await getPeriod({
        orgId: org.id,
        periodStart: period.periodStart,
      });
      if (!snapshot) break;

      // Pro bills the whole period, pooled credit applied.
      const billable = totalsFromSnapshot(snapshot.period, snapshot.lines);
      const lines = buildUsageInvoiceLines(billable, {
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
      if (!orgId) break;

      const [org] = await db
        .select({
          id: organizations.id,
          plan: organizations.plan,
          stripeCustomerId: organizations.stripeCustomerId,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      // Org gone (deleted, which cancels the sub itself): nothing to bill or
      // update, and a departing org is deliberately not sent a final invoice.
      if (!org) break;

      // Bill the final cycle's usage BEFORE dropping to free: a cancelled
      // subscription gets no renewal invoice, so this event is the only chance
      // to charge the last cycle's overage. Best-effort - a billing hiccup must
      // not strand the org on the wrong plan.
      try {
        await invoiceFinalCycle(org, subscription);
      } catch (error) {
        console.error("[stripe webhook] final-cycle invoicing failed", error);
      }

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
      break;
    }
    default:
      break;
  }

  return apiJson({ received: true });
}

/**
 * Bill the final cycle's usage when a subscription is CANCELLED.
 *
 * Usage bills in arrears on the invoice that opens the NEXT cycle - but a
 * cancelled subscription has no next cycle, so Stripe cuts no invoice and the
 * last month's overage would be lost. There is no draft to attach to either, so
 * this creates a one-off invoice for it, and only when there is real overage:
 * the base fee was already paid in advance and a $0 invoice is noise.
 *
 * Exactly-once against a redelivered event: the closed period's status and the
 * invoice claim are the same guards the normal invoice.created path uses.
 */
async function invoiceFinalCycle(
  org: { id: string; plan: string; stripeCustomerId: string | null },
  subscription: Stripe.Subscription,
): Promise<void> {
  const planId = isPlanId(org.plan) ? org.plan : "free";
  if (!planAutoInvoicesAnything(planId)) return;
  const customerId = org.stripeCustomerId;
  if (!customerId) return;

  const cycle = subscriptionCycle(subscription);
  if (!cycle) return;
  const window = invoiceUsageWindow({
    periodStart: cycle.start,
    periodEnd: cycle.end,
  });
  if (!window) return;

  const period = await closePeriod({ orgId: org.id, window, plan: org.plan });
  if (period.status === "invoiced") return;

  const snapshot = await getPeriod({
    orgId: org.id,
    periodStart: period.periodStart,
  });
  if (!snapshot) return;
  const totals = totalsFromSnapshot(snapshot.period, snapshot.lines);
  // The base fee was billed in advance; only overage beyond the credit is owed.
  if (totals.overageCents <= 0) return;

  const lines = buildUsageInvoiceLines(totals, {
    planName: PLANS[planId].name,
    period: { from: period.periodStart, to: period.periodEnd },
  });
  if (!lines.length) return;

  const collection =
    subscription.collection_method === "send_invoice"
      ? "send_invoice"
      : "charge_automatically";
  const draft = await getStripe().invoices.create({
    customer: customerId,
    collection_method: collection,
    ...(collection === "send_invoice" ? { days_until_due: 30 } : {}),
    auto_advance: false,
    description: `Final usage (${period.periodStart} → ${period.periodEnd})`,
    metadata: {
      organization_id: org.id,
      flagon_final_cycle: period.periodStart,
    },
  });
  const invoiceId = draft.id;
  if (!invoiceId) return;

  await withInvoiceClaim(
    { orgId: org.id, stripeInvoiceId: invoiceId, billingPeriodId: period.id },
    async () => {
      await addUsageToInvoice({ invoiceId, customerId, lines });
      await getStripe().invoices.finalizeInvoice(invoiceId);
      await markInvoiced({
        orgId: org.id,
        periodId: period.id,
        stripeInvoiceId: invoiceId,
      });
    },
  );
}
