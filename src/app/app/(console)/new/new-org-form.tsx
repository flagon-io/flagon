"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import { marketingHref } from "@/lib/urls";
import {
  ORG_SLUG_HINT,
  suggestOrgSlug,
  validateOrgSlug,
} from "@/lib/org-slug";
import { PLANS, type PlanId } from "@/lib/plans";
import { PlanColumns } from "@/components/plan-columns";
import { Notice, buttonClass, hintClass } from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { startProCheckout } from "../billing-actions";

/**
 * Organization setup, price-first: coming from /pricing the plan is already
 * chosen (?plan=), so only the details form renders with a plan summary.
 * Without a preselection, the plan columns render below the details.
 *
 * Pro is paid through Stripe Checkout: the org is created (free) and the
 * webhook flips it to pro when payment completes.
 */
export function NewOrgForm({
  billingEnabled,
  ownsFreeOrg,
  preselectedPlan,
}: {
  billingEnabled: boolean;
  ownsFreeOrg: boolean;
  preselectedPlan: PlanId | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PlanId | "unbilled" | null>(null);

  const preselected =
    billingEnabled &&
    preselectedPlan &&
    !(preselectedPlan === "free" && ownsFreeOrg)
      ? preselectedPlan
      : null;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(suggestOrgSlug(value));
  }

  async function createOrg(plan: PlanId | null) {
    setError(null);

    if (!name.trim()) {
      setError("Give your organization a name first.");
      return;
    }
    const validation = validateOrgSlug(slug);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setPending(plan ?? "unbilled");
    const { error: createError } = await authClient.organization.create({
      name: name.trim(),
      slug,
      ...(plan ? { plan } : {}),
    } as Parameters<typeof authClient.organization.create>[0]);
    if (createError) {
      setPending(null);
      setError(
        createError.message ?? "Something went wrong. Please try again.",
      );
      return;
    }

    if (plan === "pro") {
      // Org exists (on free); payment completes on Stripe's hosted page and
      // the webhook upgrades the plan.
      const checkout = await startProCheckout(slug);
      if (!checkout.ok) {
        setPending(null);
        setError(checkout.message);
        router.refresh();
        return;
      }
      window.location.href = checkout.url;
      return;
    }

    router.push(`/app/${slug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-8">
      {/* Heading */}
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
          Tell us about your organization
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100">
          Set up your organization
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-400">
          Organizations are where projects, teams, and billing live.
        </p>
      </div>

      {error ? (
        <div className="mx-auto mt-6 max-w-xl">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {/* Details */}
      <div className="mx-auto mt-10 max-w-xl space-y-5 border border-white/10 bg-white/2 p-6 sm:p-7">
        <div>
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Acme Corp"
            required
          />
        </div>
        <div>
          <Label htmlFor="org-slug">Slug</Label>
          <Input
            id="org-slug"
            prepend={`app.${brand.domain}/`}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value.toLowerCase());
            }}
            placeholder="acme-corp"
            required
          />
          <p className={hintClass}>{ORG_SLUG_HINT}</p>
        </div>

        {preselected ? (
          <div className="border-t border-white/5 pt-5">
            <div className="flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3">
              <div>
                <span className="text-sm font-semibold text-zinc-100">
                  {PLANS[preselected].name}
                </span>
                <span className="ml-2 text-sm text-zinc-400">
                  {preselected === "free"
                    ? "$0 forever"
                    : `$${PLANS.pro.priceMonthly}/month`}
                </span>
              </div>
              <Link
                href="/app/new"
                className="text-xs text-teal-400 transition hover:text-teal-300 hover:underline"
              >
                Change plan
              </Link>
            </div>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => createOrg(preselected)}
              className={`mt-4 w-full ${buttonClass} py-2.5 text-center`}
            >
              {pending
                ? preselected === "pro"
                  ? "Heading to checkout..."
                  : "Creating..."
                : preselected === "pro"
                  ? "Create and continue to payment"
                  : "Create organization"}
            </button>
          </div>
        ) : null}

        {!billingEnabled ? (
          <div className="border-t border-white/5 pt-5">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => createOrg(null)}
              className={`w-full ${buttonClass} py-2.5 text-center`}
            >
              {pending === "unbilled" ? "Creating..." : "Create organization"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Plans (only when nothing is preselected) */}
      {billingEnabled && !preselected ? (
        <>
          <div className="mt-16 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
              Choose a plan
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
              Pick a plan for your organization
            </h2>
          </div>
          <div className="mt-8">
            <PlanColumns
              freeCta={
                <div>
                  <button
                    type="button"
                    disabled={ownsFreeOrg || pending !== null}
                    onClick={() => createOrg("free")}
                    className="inline-block rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending === "free"
                      ? "Creating..."
                      : "Create a Hobby organization"}
                  </button>
                  {ownsFreeOrg ? (
                    <p className="mt-2 text-xs leading-5 text-amber-300/80">
                      You already have a Hobby organization. Additional
                      organizations start on Pro.
                    </p>
                  ) : null}
                </div>
              }
              proCta={
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => createOrg("pro")}
                  className="inline-block rounded-full bg-teal-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:cursor-default disabled:opacity-60"
                >
                  {pending === "pro"
                    ? "Heading to checkout..."
                    : "Continue with Pro"}
                </button>
              }
              enterpriseCta={
                <Link
                  href={marketingHref("/enterprise/contact")}
                  className="inline-block rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
                >
                  Contact sales
                </Link>
              }
            />
          </div>
        </>
      ) : null}

      {!billingEnabled ? (
        <div className="mx-auto mt-10 max-w-xl">
          <Notice tone="info">
            Billing isn&apos;t configured on this deployment, so plans
            don&apos;t apply here: every organization runs with everything
            unlocked.
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
