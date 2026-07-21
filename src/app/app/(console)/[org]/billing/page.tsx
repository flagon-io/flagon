import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { billingEnabled, getBillingSummary } from "@/lib/billing";
import { coversUsage } from "@/lib/discounts";
import { PLANS, isPlanId, type PlanId } from "@/lib/plans";
import { marketingHref } from "@/lib/urls";
import { resolveOrg } from "../resolve-org";
import { UpgradeButton } from "../upgrade-button";
import { ManageBillingButton } from "./billing-actions-ui";

export const metadata: Metadata = { title: "Billing" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    // Whole dollars stay whole: "$20", not "$20.00", unless there are cents to
    // show - a usage true-up of $30.14 has to keep them.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "per month", or "every 3 months" when the interval is not 1. */
function intervalLabel(subscription: {
  interval: string | null;
  intervalCount: number;
}): string {
  if (!subscription.interval) return "";
  return subscription.intervalCount === 1
    ? `per ${subscription.interval}`
    : `every ${subscription.intervalCount} ${subscription.interval}s`;
}

/** Stripe's statuses, in words a customer can act on. */
const STATUS_COPY: Record<string, string> = {
  active: "Active",
  trialing: "In trial",
  past_due: "Payment past due",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Awaiting payment",
  incomplete_expired: "Expired",
  paused: "Paused",
};

/**
 * Billing - `app.flagon.io/<org>/billing`: the current plan, what it
 * includes, and the way out (upgrade, or Stripe's portal for payment
 * method, invoices, and cancellation). Deployments without Stripe show the
 * plan for what it is: everything unlocked, nothing to pay.
 */
export default async function BillingPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const [org, session] = await Promise.all([
    resolveOrg(slug),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!org || !session) notFound();

  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  if (role !== "owner" && role !== "admin") notFound();

  const rawPlan = (org as { plan?: string }).plan ?? "free";
  const planId: PlanId = isPlanId(rawPlan) ? rawPlan : "free";
  const plan = PLANS[planId];
  const billing = billingEnabled();

  // The portal is Stripe's, so it only exists for an org Stripe knows about.
  // Rendering the button without a customer turned a state that is perfectly
  // normal - an enterprise org invoiced by agreement, a plan set by hand -
  // into a red error the person could only discover by clicking.
  const [row] = await db
    .select({ customerId: organizations.stripeCustomerId })
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  const hasStripeCustomer = Boolean(row?.customerId);

  // Read from Stripe when there is a customer, so what this page says is what
  // the invoice will say - including for an organization whose terms were
  // negotiated rather than picked off the pricing page. Best-effort: a Stripe
  // outage degrades this to the plan description instead of erroring.
  const summary =
    billing && row?.customerId ? await getBillingSummary(row.customerId) : null;

  // Enterprise is priced per agreement (priceMonthly is null), so there is no
  // plan number to print. Reading it off PLANS.pro - which is what this did -
  // put "$20 per month" under the word Enterprise on a contract customer's own
  // billing page. A live subscription always wins over both.
  //
  // amountCents is now the DISCOUNTED figure. Printing the list price at
  // someone on three free months told them they were paying $20 a month right
  // up until they checked their statement and found they were not.
  const priceLine = summary?.subscription
    ? `${money(summary.subscription.amountCents, summary.subscription.currency)} ${intervalLabel(summary.subscription)}`
    : plan.priceMonthly === null
      ? "Custom pricing, billed by agreement"
      : `$${plan.priceMonthly} per month`;

  // Only worth striking through when the discount actually moved the number.
  const discount = summary?.discount ?? null;
  const listPrice =
    summary?.subscription &&
    summary.subscription.listAmountCents > summary.subscription.amountCents
      ? money(
          summary.subscription.listAmountCents,
          summary.subscription.currency,
        )
      : null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        {org.name}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Billing
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        The plan for this organization and how it&apos;s paid for.
      </p>

      <div className="mt-8 border border-white/10 bg-white/2 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-zinc-100">
                {plan.name}
              </h2>
              <span className="rounded-full border border-teal-500/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-teal-300">
                Current plan
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-500">
              {listPrice ? (
                <span className="text-zinc-600 line-through">{listPrice}</span>
              ) : null}
              <span className={listPrice ? "text-zinc-300" : undefined}>
                {priceLine}
              </span>
            </p>

            {/* A discount gets its own line with its DURATION spelled out.
                Someone who cannot tell a permanent discount from a trial one
                finds out the hard way, on the first invoice at full price. */}
            {discount ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="rounded-full border border-teal-500/40 px-2 py-0.5 font-medium text-teal-300">
                  {discount.label}
                  {discount.durationLabel ? ` ${discount.durationLabel}` : ""}
                </span>
                {discount.endsAt ? (
                  <span className="text-zinc-500">
                    Ends {dateFormat.format(discount.endsAt)}
                  </span>
                ) : null}
                {/* Which lines it reaches. addUsageToInvoice attaches metered
                    overage to the same invoice, so an unrestricted coupon
                    discounts usage too - worth saying out loud rather than
                    discovering at scale. */}
                <span className="text-zinc-500">
                  {coversUsage(discount)
                    ? "Applies to usage as well as the subscription"
                    : "Applies to the subscription only"}
                </span>
              </p>
            ) : null}

            {summary?.subscription ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                <span
                  className={
                    ["past_due", "unpaid", "incomplete"].includes(
                      summary.subscription.status,
                    )
                      ? "font-medium text-amber-300"
                      : "text-zinc-400"
                  }
                >
                  {STATUS_COPY[summary.subscription.status] ??
                    summary.subscription.status}
                </span>
                {summary.subscription.renewsAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {/* A subscription set to cancel does not "renew" on the
                          date it ends, and saying so is how someone finds out
                          too late that they are still being charged. */}
                      {summary.subscription.cancelAtPeriodEnd
                        ? `Ends ${dateFormat.format(summary.subscription.renewsAt)}`
                        : `Renews ${dateFormat.format(summary.subscription.renewsAt)}`}
                    </span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>
                  {summary.subscription.collection === "send_invoice"
                    ? "Invoiced by email"
                    : summary.card
                      ? `${summary.card.brand.replace(/^\w/, (letter: string) => letter.toUpperCase())} ending ${summary.card.last4}`
                      : "No payment method on file"}
                </span>
                {/* The one figure on this page that is not derived locally:
                    Stripe's own preview, with proration, discounts, taxes and
                    credit balance already in it. For anyone on a promotion it
                    is the number they actually want, and the only one we can
                    promise matches the charge. */}
                {summary.nextInvoiceCents !== null ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      Next invoice{" "}
                      {money(
                        summary.nextInvoiceCents,
                        summary.subscription.currency,
                      )}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {billing ? (
            <div className="pt-1">
              {planId === "free" ? (
                <UpgradeButton orgSlug={slug} />
              ) : hasStripeCustomer ? (
                <ManageBillingButton orgSlug={slug} />
              ) : null}
            </div>
          ) : null}
        </div>

        <ul className="mt-6 grid grid-cols-1 gap-3 border-t border-white/5 pt-5 sm:grid-cols-2">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm leading-5 text-zinc-300"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
                aria-hidden
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {billing ? (
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          {planId === "free" ? (
            <>
              Compare what each plan includes on the{" "}
              <Link
                href={marketingHref("/pricing")}
                className="text-teal-400 transition hover:text-teal-300"
              >
                pricing page
              </Link>
              .
            </>
          ) : hasStripeCustomer ? (
            "Payment method, invoices, and cancellation are handled in the billing portal."
          ) : (
            // No Stripe customer on a paid plan means nothing was ever charged
            // through Checkout: an agreement, or a plan set by an operator.
            // Saying so beats a portal link that cannot open.
            "This organization is invoiced by agreement rather than through Stripe Checkout, so there is no self-serve portal for it."
          )}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          Billing isn&apos;t configured on this deployment, so plans don&apos;t
          apply: this organization runs with everything unlocked.
        </p>
      )}
    </div>
  );
}
