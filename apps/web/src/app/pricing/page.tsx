import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  brand,
  Cta,
  GridBackdrop,
  PLANS,
  PlanCard,
  SELF_HOST_NOTE,
  type Plan,
} from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SIGN_UP_URL } from "@/lib/urls";

export const metadata: Metadata = {
  title: `Pricing · ${brand.name}`,
  description: `Simple, usage-based pricing for ${brand.name}. Start free.`,
};

/**
 * The marketing pricing page. Renders the SAME shared plan catalog and PlanCard
 * as the in-app create-organization picker, so the two never drift. Only Hobby
 * is available during the alpha; Pro and Enterprise show as coming soon.
 */
export default function PricingPage() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Simple, usage-based pricing
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-400">
            One subscription, pooled across every product. You pay for usage,
            never for seats, so adding a teammate never changes the bill. Start
            free and self-host any time.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-xl border border-white/10">
          <div className="grid divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                highlighted={Boolean(plan.popular) && plan.available}
                cta={ctaFor(plan)}
              />
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-1.5 text-center text-sm text-zinc-500">
          <p>{SELF_HOST_NOTE}</p>
          <p>
            Billing is not enabled during the alpha. Hobby is free and unmetered
            while we build toward launch.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

/** The pricing-page CTA for each plan (distinct from in-app plan selection). */
function ctaFor(plan: Plan): ReactNode {
  if (plan.id === "enterprise") {
    return (
      <Cta
        variant="secondary"
        size="md"
        shape="pill"
        href="mailto:sales@flagon.io"
        className="w-full"
      >
        {plan.ctaLabel}
      </Cta>
    );
  }
  // Any available plan (Hobby, and Pro during the alpha) goes to sign-up, where
  // the plan is actually chosen on the create-organization step.
  if (plan.available) {
    return (
      <Cta
        variant={plan.popular ? "primary" : "secondary"}
        size="md"
        shape="pill"
        href={SIGN_UP_URL}
        className="w-full"
      >
        {plan.ctaLabel}
      </Cta>
    );
  }
  // Not yet available: a disabled, non-link CTA.
  return (
    <span
      aria-disabled="true"
      className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/4 px-5 py-2.5 text-sm font-semibold text-zinc-500"
    >
      {plan.ctaLabel}
    </span>
  );
}
