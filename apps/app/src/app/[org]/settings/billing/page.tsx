import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { PLANS, planName } from "@/lib/plans";
import { getBillingSummary, type BillingSummary } from "@/lib/flags-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { BillingActionButton } from "./billing-actions";

export const metadata: Metadata = { title: "Billing · Organization settings" };

const PRO = PLANS.find((p) => p.id === "pro");

/** Format an ISO date as e.g. "Jan 5, 2027" (UTC), for discount end dates. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The clear, in-console signal that a comped org is not being charged. A comp is a
 * real Stripe subscription carrying a 100%-off coupon; when a discount is present we
 * say so plainly (fully comped, or the partial discount). null when there's no
 * discount (paying the full rate) — nothing to show.
 */
function DiscountBanner({ discount }: { discount: BillingSummary["discount"] }) {
  if (!discount) return null;
  const fully = discount.percentOff === 100;
  const name = discount.name ? ` (${discount.name})` : "";
  const until = discount.endsAt ? ` through ${shortDate(discount.endsAt)}` : "";

  const headline = fully
    ? `On Pro at no charge${name}.`
    : discount.percentOff != null
      ? `${discount.percentOff}% off applied${name}.`
      : discount.amountOffCents != null
        ? `$${(discount.amountOffCents / 100).toFixed(2)} off applied${name}.`
        : `A discount is applied${name}.`;

  const detail = fully
    ? `You won't be billed while this applies${until}.`
    : `Your Pro subscription is discounted${until}.`;

  return (
    <div className="mb-6 rounded-lg border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-sm">
      <p className="font-medium text-teal-200">{headline}</p>
      <p className="mt-0.5 text-teal-200/70">{detail}</p>
    </div>
  );
}

/** A friendly label for a raw Stripe subscription status. */
function statusLabel(status: string | null): string | null {
  if (!status) return null;
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trialing";
    case "past_due":
      return "Past due — update your card";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    default:
      return status;
  }
}

export default async function OrgBillingPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const canManage = canManageOrg(membership.role);
  const isPro = membership.plan === "pro";
  const isEnterprise = membership.plan === "enterprise";
  const status = statusLabel(membership.subscriptionStatus);

  // Only Stripe-backed Pro orgs have a subscription to summarize; skip the Stripe
  // round-trip for Hobby and null-status (manually-granted) Pro. Surfaces the comp
  // coupon so a comped org can plainly see it isn't being charged.
  const summary =
    isPro && membership.stripeCustomerId ? await getBillingSummary(slug) : null;

  return (
    <div>
      <SettingsHeader
        title="Billing"
        description="Your organization's plan and subscription."
      />

      <DiscountBanner discount={summary?.discount ?? null} />

      <SettingsSection
        title="Current plan"
        description="What this organization is on today."
        action={
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200">
            {planName(membership.plan)}
          </span>
        }
      >
        <div className="flex flex-col gap-1 text-sm text-zinc-400">
          {isEnterprise ? (
            <p>
              You are on an Enterprise plan. Reach out to your account contact
              to make changes.
            </p>
          ) : isPro ? (
            <p>
              You are on Pro
              {status ? (
                <>
                  {" "}
                  <span
                    className={
                      membership.subscriptionStatus === "past_due" ||
                      membership.subscriptionStatus === "unpaid"
                        ? "text-amber-400"
                        : "text-zinc-300"
                    }
                  >
                    ({status})
                  </span>
                </>
              ) : (
                " (granted)"
              )}
              . Thanks for supporting Flagon.
            </p>
          ) : (
            <p>You are on the free Hobby plan.</p>
          )}
        </div>
      </SettingsSection>

      {/* Manage or upgrade. Enterprise is not self-serve. */}
      {!isEnterprise ? (
        <div className="mt-6">
          <SettingsSection
            title={isPro ? "Manage subscription" : "Upgrade to Pro"}
            description={
              isPro
                ? "Update your card, download invoices, or cancel."
                : `${PRO?.price.amount ?? "$50"} per month plus usage, billed monthly. Cancel anytime.`
            }
          >
            {!canManage ? (
              <p className="text-sm text-zinc-500">
                Only owners and admins can manage billing.
              </p>
            ) : isPro && membership.stripeCustomerId ? (
              <BillingActionButton
                slug={slug}
                action="portal"
                label="Manage subscription"
                variant="secondary"
              />
            ) : isPro && !membership.stripeCustomerId ? (
              // On Pro but not through Stripe (e.g. comped/manually granted).
              <p className="text-sm text-zinc-500">
                This organization is on Pro without a Stripe subscription. No
                action is needed.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {PRO ? (
                  <ul className="flex flex-col gap-1.5">
                    {/* Only tout what actually ships today; roadmap ("soon")
                        features are omitted from the upgrade pitch. */}
                    {PRO.features
                      .filter((f) => !f.soon)
                      .map((f) => (
                        <li
                          key={f.text}
                          className="flex items-center gap-2 text-sm text-zinc-300"
                        >
                          <Check className="size-4 shrink-0 text-teal-400" />
                          {f.text}
                        </li>
                      ))}
                  </ul>
                ) : null}
                <BillingActionButton
                  slug={slug}
                  action="checkout"
                  label="Upgrade to Pro"
                />
              </div>
            )}
          </SettingsSection>
        </div>
      ) : null}
    </div>
  );
}
