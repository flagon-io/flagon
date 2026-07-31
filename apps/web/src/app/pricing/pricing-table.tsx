import type { ReactNode } from "react";
import { BleedBand, Cta, PLANS, PlanCard, type Plan } from "@flagon/design";
import { SIGN_UP_URL } from "@/lib/urls";

/**
 * The pricing table over the shared plan catalog. Desktop is a full-bleed table
 * (section rules run off the page via BleedBand); mobile falls back to the shared
 * stacked PlanCard. Both render the same catalog as the in-app create-organization
 * picker, so the two never drift.
 *
 * Pricing is a single monthly base plus metered usage: free unlimited flag
 * checks, a per-plan monthly pool of analytics events, and overage only on the
 * paid plan. No per-seat charge, no annual/discount interval.
 */
export function PricingTable() {
  return (
    <>
      {/* Desktop: full-bleed table. */}
      <div className="hidden md:block">
        <BleedBand>
          <Row>
            {PLANS.map((plan) => (
              <HeadCell key={plan.id} plan={plan} />
            ))}
          </Row>
          <FullRule />
          <Row>
            {PLANS.map((plan) => (
              <FeatureCell key={plan.id} plan={plan} />
            ))}
          </Row>
          <FullRule />
          <Row>
            {PLANS.map((plan) => (
              <div key={plan.id} className={`p-8 ${tint(plan)}`}>
                {ctaFor(plan)}
              </div>
            ))}
          </Row>
        </BleedBand>
      </div>

      {/* Mobile: shared stacked card. */}
      <div className="mx-auto w-full max-w-md px-6 md:hidden">
        <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
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
    </>
  );
}

/** The popular plan's column carries a faint tint the whole way down. */
function tint(plan: Plan): string {
  return plan.popular && plan.available ? "bg-white/3" : "";
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-white/10">{children}</div>
  );
}

/**
 * A horizontal rule that escapes the content column to run the full width of the
 * viewport, matching BleedBand's own edge-to-edge rules for internal dividers.
 */
function FullRule() {
  return (
    <div
      aria-hidden
      className="relative left-1/2 w-screen -translate-x-1/2 border-t border-white/10"
    />
  );
}

function HeadCell({ plan }: { plan: Plan }) {
  const popular = Boolean(plan.popular) && plan.available;
  return (
    <div className={`relative p-8 ${tint(plan)}`}>
      {popular ? (
        <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-teal-400/70" />
      ) : null}
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-zinc-100">{plan.name}</span>
        {popular ? <Pill accent>Popular</Pill> : null}
      </div>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-4xl font-semibold tracking-tight text-zinc-50">
          {plan.price.amount}
        </span>
        {plan.price.unit ? (
          <span className="text-sm text-zinc-500">{plan.price.unit}</span>
        ) : null}
        {plan.price.plus ? (
          <span className="text-sm font-medium text-zinc-400">{plan.price.plus}</span>
        ) : null}
      </div>
      <p className="mt-3 text-sm/6 text-zinc-400">{plan.description}</p>
      {plan.note ? (
        <p className="mt-2 text-xs/5 text-zinc-500">{plan.note}</p>
      ) : null}
    </div>
  );
}

function FeatureCell({ plan }: { plan: Plan }) {
  return (
    <div className={`h-full p-8 ${tint(plan)}`}>
      {plan.featuresLead ? (
        <p className="mb-4 text-xs font-medium tracking-wide text-zinc-400">
          {plan.featuresLead}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {plan.features.map((feature) => (
          <li
            key={feature.text}
            className={`flex items-start gap-2.5 text-sm/6 ${
              feature.soon ? "text-zinc-500" : "text-zinc-300"
            }`}
          >
            <CheckIcon dim={feature.soon} />
            <span className="flex-1">{feature.text}</span>
            {feature.soon ? <SoonTag /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
        accent ? "border-teal-500/40 text-teal-300" : "border-white/15 text-zinc-400"
      }`}
    >
      {children}
    </span>
  );
}

function SoonTag() {
  return (
    <span className="shrink-0 self-center rounded border border-white/12 px-1 py-px text-[9px] leading-none font-medium tracking-wide text-zinc-500 uppercase">
      Soon
    </span>
  );
}

function CheckIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      className={`mt-1 shrink-0 ${dim ? "text-zinc-600" : "text-teal-400/80"}`}
      aria-hidden
      focusable="false"
    >
      <path
        d="M13.5 4.5L6.5 11.5L3 8"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The pricing-page CTA for each plan. Squared off (not pill) so it reads as a
 *  product action, not a marketing balloon. */
function ctaFor(plan: Plan): ReactNode {
  if (plan.id === "enterprise") {
    return (
      <Cta variant="secondary" size="md" shape="square" href="mailto:sales@flagon.io" className="w-full">
        {plan.ctaLabel}
      </Cta>
    );
  }
  if (plan.available) {
    return (
      <Cta
        variant={plan.popular ? "primary" : "secondary"}
        size="md"
        shape="square"
        href={SIGN_UP_URL}
        className="w-full"
      >
        {plan.ctaLabel}
      </Cta>
    );
  }
  return (
    <span
      aria-disabled="true"
      className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-md border border-white/10 bg-white/4 px-5 py-2.5 text-sm font-semibold text-zinc-500"
    >
      {plan.ctaLabel}
    </span>
  );
}
