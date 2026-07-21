import type { Metadata } from "next";
import Link from "next/link";
import { Braces, CreditCard, Server } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { PLANS } from "@/lib/plans";
import {
  activeMeters,
  formatMeterRate,
  formatQuantity,
  getMeter,
} from "@/lib/meters";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";
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
    title: "Run it yourself",
    body: "Source-available under the FSL. Deploy the whole platform on your own infrastructure, for your own use, with no license fee.",
  },
] as const;

/**
 * Public pricing. Same plan columns as the in-app creation flow; CTAs land
 * on /app/new with the plan preselected (price first, org details second).
 */
export default function PricingPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pay for usage,
            <br />
            <span className="text-zinc-500">not seats.</span>
          </>
        }
        lede={
          <>
            Start free, no card required. Upgrade to Pro when you&apos;re ready
            to ship for real, and pay for what you actually serve.
          </>
        }
        footnote={`One pooled credit across every product. Or run it yourself, source-available.`}
        rule={false}
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 pb-20 sm:px-12 lg:px-20">
        {/* Plans: ruled edge to edge, so the plan band divides the page rather
            than sitting on it. Its own top rule closes the hero, which is why
            the hero above draws none. */}
        <BleedBand className="bg-white/2">
          <PlanColumns
            bare
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
        </BleedBand>

        {/* Rates, straight from the meter registry. Rendering them rather than
            writing them down is what stops the pricing page and the invoice
            from ever quoting different numbers. */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-300">
            Usage beyond your included credit
          </h2>
          <dl className="mt-3 max-w-2xl divide-y divide-white/5 border border-white/10">
            {activeMeters().map((meter) => (
              <div
                key={meter.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3"
              >
                <div>
                  <dt className="text-sm text-zinc-200">{meter.label}</dt>
                  <dd className="mt-0.5 text-xs leading-5 text-zinc-500">
                    {meter.description}
                  </dd>
                </div>
                <dd className="shrink-0 font-mono text-sm text-zinc-300">
                  {formatMeterRate(meter)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            Your included usage is a{" "}
            <strong className="text-zinc-300">pooled credit</strong>, not a
            per-product allowance: spend it on whichever products you actually
            use. At the rate above, Pro&apos;s $
            {PLANS.pro.includedUsageCents / 100} covers roughly{" "}
            {formatQuantity(
              (PLANS.pro.includedUsageCents /
                (getMeter("flags.evaluations")?.unitAmountCents ?? 1)) *
                (getMeter("flags.evaluations")?.per ?? 0),
            )}{" "}
            flag evaluations if that is all you run, or any mix across products
            adding up to the same money.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Hobby is capped rather than billed, so it can never produce an
            invoice. Pro and Enterprise are billed past their included usage and
            are never cut off.
          </p>
        </div>

        {/* Every plan includes: same edge-to-edge rules, and the columns are
            divided by their own rules rather than boxed as three cards, so the
            band reads as one block instead of a row of tiles. */}
        <BleedBand outerClassName="mt-24">
          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {included.map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-8">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center border border-teal-500/20 bg-teal-500/10 text-teal-300"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-zinc-100">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </BleedBand>

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
