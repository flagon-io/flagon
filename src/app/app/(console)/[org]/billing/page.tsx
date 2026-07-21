import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { auth } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { PLANS, isPlanId, type PlanId } from "@/lib/plans";
import { marketingHref } from "@/lib/urls";
import { resolveOrg } from "../resolve-org";
import { UpgradeButton } from "../upgrade-button";
import { ManageBillingButton } from "./billing-actions-ui";

export const metadata: Metadata = { title: "Billing" };

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
            <p className="mt-1 text-sm text-zinc-500">
              {planId === "free"
                ? "$0 per month"
                : `$${PLANS.pro.priceMonthly} per month`}
            </p>
          </div>
          {billing ? (
            <div className="pt-1">
              {planId === "free" ? (
                <UpgradeButton orgSlug={slug} />
              ) : (
                <ManageBillingButton orgSlug={slug} />
              )}
            </div>
          ) : null}
        </div>

        <ul className="mt-6 grid grid-cols-1 gap-3 border-t border-white/5 pt-5 sm:grid-cols-2">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm leading-5 text-zinc-300"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
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
          ) : (
            "Payment method, invoices, and cancellation are handled in the billing portal."
          )}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          Billing isn&apos;t configured on this deployment, so plans
          don&apos;t apply: this organization runs with everything unlocked.
        </p>
      )}
    </div>
  );
}
