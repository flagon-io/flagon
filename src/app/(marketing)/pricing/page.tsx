import type { Metadata } from "next";
import Link from "next/link";
import { Braces, CreditCard, Server } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { PLANS } from "@/lib/plans";
import { PlanColumns } from "@/components/plan-columns";

export const metadata: Metadata = {
  title: `Pricing · ${brand.name}`,
  description: `Simple, usage-based pricing. Free to start, Pro at $${PLANS.pro.priceMonthly}/month with usage credit included, and fixed-price Enterprise contracts. No seat-based pricing, ever.`,
};

const ctaClass =
  "inline-block rounded-full px-5 py-2 text-sm font-semibold transition";
const primaryCta = `${ctaClass} bg-teal-500 text-zinc-950 hover:bg-teal-400`;
const outlineCta = `${ctaClass} border border-white/15 text-zinc-200 hover:border-white/30 hover:text-white`;

const included = [
  {
    icon: CreditCard,
    title: "Start without a card",
    body: "Hobby needs no credit card, and it can never generate a bill. Upgrade only when you're ready.",
  },
  {
    icon: Braces,
    title: "Full API access",
    body: "Every plan gets the complete REST API and OpenAPI spec. No feature gates on the interface.",
  },
  {
    icon: Server,
    title: "Self-host free, forever",
    body: "Run the whole platform on your own infrastructure with everything enabled and nothing metered.",
  },
] as const;


/**
 * Public pricing. Same plan columns as the in-app creation flow; CTAs land
 * on /app/new with the plan preselected (price first, org details second).
 */
export default function PricingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient glow behind the hero + Pro column */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-150"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-20">
        {/* Hero */}
        <div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-100 sm:text-6xl">
            Pay for usage,
            <br />
            <span className="text-zinc-500">not seats.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">
            Start free, no card required. Upgrade to Pro when you&apos;re
            ready to ship for real.
          </p>
        </div>

        {/* Plans */}
        <div className="mt-14">
          <PlanColumns
            freeCta={
              <Link href={appHref("/new?plan=free")} className={outlineCta}>
                Start for free
              </Link>
            }
            proCta={
              <Link href={appHref("/new?plan=pro")} className={primaryCta}>
                Get started with Pro
              </Link>
            }
            enterpriseCta={
              <Link href="/enterprise/contact" className={outlineCta}>
                Contact sales
              </Link>
            }
          />
        </div>

        {/* Every plan includes */}
        <div className="mt-24">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Every plan includes
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {included.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="border border-white/10 bg-white/2 p-6"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center border border-teal-500/20 bg-teal-500/10 text-teal-300"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-zinc-100">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-zinc-400">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Closing CTA */}
        <div className="relative mt-24 overflow-hidden border border-white/10 px-6 py-14 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 100% at 50% 100%, rgba(13,148,136,0.25) 0%, rgba(13,148,136,0.08) 50%, transparent 100%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
              {brand.taglineLead}{" "}
              <span className="text-zinc-400">{brand.taglineFollow}</span>
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={appHref("/new?plan=free")}
                className="rounded-md bg-teal-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
              >
                Start for free
              </Link>
              <Link
                href="/enterprise/contact"
                className="rounded-md border border-white/10 px-6 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
