import type { Metadata } from "next";
import Link from "next/link";
import { Braces, CreditCard, Server } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import {
  activeMeters,
  formatCents,
  formatMeterRate,
  formatQuantity,
  getMeter,
} from "@/lib/meters";
import { proHeadline } from "@/lib/plan-catalog.server";
import { marketingColumns } from "@/lib/marketing-plans";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";
import { PlanColumns } from "@/components/plan-columns";

/**
 * Static marketing, one live number.
 *
 * The plan columns are static copy (src/lib/marketing-plans.ts), so this page
 * does not depend on the billing catalog to render the right set of plans. The
 * only thing read from the database is the active Pro price/credit
 * (proHeadline), so the public number can never disagree with what a signup is
 * charged. Revalidated hourly: a price change is picked up without a deploy, and
 * the page still serves from cache under load. The operator console is a
 * separate Vercel project and cannot revalidatePath() across that boundary, so a
 * time window is the mechanism.
 *
 * The literal is inlined because Next statically analyses segment config. Keep
 * the three marketing pages (here, /, /terms) on the same number.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const pro = await proHeadline();
  const price = `Pro at ${formatCents(pro.priceCents).replace(/\.00$/, "")}/${pro.interval}`;
  return {
    title: `Pricing · ${brand.name}`,
    description: `Simple, usage-based pricing. Free to start, ${price} with usage credit included, and Enterprise coming soon. No seat-based pricing, ever.`,
  };
}

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
    href: "/docs/self-hosting",
    linkText: "Read the self-hosting guide",
  },
] as const;

/**
 * Public pricing. Same plan columns as the in-app creation flow; CTAs land
 * on /app/new with the plan preselected (price first, org details second).
 */
export default async function PricingPage() {
  const pro = await proHeadline();
  const columns = marketingColumns(pro);

  // CTAs are per-plan: a self-serve plan links into creation with itself
  // preselected; the coming-soon column links to its waitlist instead. Derived
  // from `comingSoon`/`billable`, not the plan name.
  const ctas = Object.fromEntries(
    columns.map((plan) => [
      plan.id,
      plan.comingSoon ? (
        <Link href="/enterprise" className={outlineCta}>
          Get notified
        </Link>
      ) : (
        <Link
          href={appHref(`/new?plan=${plan.plan}`)}
          className={plan.highlight ? primaryCta : outlineCta}
        >
          {plan.billable ? `Get started with ${plan.displayName}` : "Start for free"}
        </Link>
      ),
    ]),
  );

  // What Pro's credit buys, at the published evaluation rate from the meter
  // registry (Pro does not re-price evaluations, so this matches the invoice).
  const evalMeter = getMeter("flags.evaluations");
  const headlineCredit = pro.includedCreditCents;
  const creditBuys =
    evalMeter && evalMeter.unitAmountCents > 0
      ? evalMeter.includedQuantity +
        (headlineCredit / evalMeter.unitAmountCents) * evalMeter.per
      : null;

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
          <PlanColumns bare plans={columns} ctas={ctas} />
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
          {creditBuys ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
              Your included usage is a{" "}
              <strong className="text-zinc-300">pooled credit</strong>, not a
              per-product allowance: spend it on whichever products you actually
              use. Pro&apos;s{" "}
              {formatCents(headlineCredit).replace(/\.00$/, "")} covers roughly{" "}
              {formatQuantity(creditBuys)} flag evaluations if that is all you
              run, or any mix across products adding up to the same money.
            </p>
          ) : null}
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            {/* Derived from the plans themselves: a tier that is not billed can
                never produce an invoice, and saying so by name would go stale
                the moment the tiers change. */}
            {columns
              .filter((plan) => !plan.billable && !plan.comingSoon)
              .map((plan) => plan.displayName)
              .join(" and ") || "Unbilled tiers are"}{" "}
            capped rather than billed, so they can never produce an invoice.
            Everything else is billed past its included usage and is never cut
            off.
          </p>
        </div>

        {/* Every plan includes: same edge-to-edge rules, and the columns are
            divided by their own rules rather than boxed as three cards, so the
            band reads as one block instead of a row of tiles. */}
        <BleedBand outerClassName="mt-24">
          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {included.map((item) => {
              const { icon: Icon, title, body } = item;
              const href = "href" in item ? item.href : null;
              const linkText = "linkText" in item ? item.linkText : null;
              return (
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
                  <p className="mt-1.5 text-sm leading-6 text-zinc-400">
                    {body}
                  </p>
                  {href && linkText ? (
                    <Link
                      href={href}
                      className="mt-2 inline-block text-sm font-medium text-teal-400 transition hover:text-teal-300"
                    >
                      {linkText} &rarr;
                    </Link>
                  ) : null}
                </div>
              );
            })}
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
                href="/enterprise"
                className="rounded-md border border-white/10 px-6 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
              >
                Enterprise, coming soon
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
