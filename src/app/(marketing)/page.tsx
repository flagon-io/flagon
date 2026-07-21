import Link from "next/link";
import { ArrowRight, BookOpen, Flag, Puzzle, Scale, Server } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { PLANS } from "@/lib/plans";
import { activeMeters, formatMeterRate } from "@/lib/meters";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";

/**
 * The homepage.
 *
 * Structured as an argument rather than a hero and a wall of features: the
 * problem (every tool re-describes your organization), the products that exist
 * today, what makes them different, and what it costs. Each section is a ruled
 * band, so the page reads as a measured document rather than a scroll of
 * floating cards.
 */
const products = [
  {
    name: "Catalog",
    href: "/products/catalog",
    icon: BookOpen,
    body: "Projects, teams, ownership, and access. Model your organization once; every product inherits it.",
  },
  {
    name: "Feature Flags",
    href: "/products/feature-flags",
    icon: Flag,
    body: "Typed flags with targeting, segments, and rollouts, served over the OpenFeature standard.",
  },
] as const;

const principles = [
  {
    icon: Puzzle,
    title: "Standards, not lock-in",
    body: "Flags are served over OFREP, so you integrate a standard OpenFeature SDK. Nothing in your application code names us, which means arriving is a config change and so is leaving.",
  },
  {
    icon: Scale,
    title: "Usage, never seats",
    body: "Adding a teammate never changes the bill, on any plan. One subscription returns as one pooled credit you spend on whichever products you actually use.",
  },
  {
    icon: Server,
    title: "Self-host the whole thing",
    body: "Every capability, unmetered, on your own Postgres. There is no reduced community edition, and nothing is held back for the hosted service.",
  },
] as const;

const steps = [
  {
    step: "01",
    title: "Create an organization",
    body: "It owns your projects, your people, and one bill. Free, and no card.",
  },
  {
    step: "02",
    title: "Describe what you have",
    body: "Projects with a README, owners, and access roles. Every product reads from this.",
  },
  {
    step: "03",
    title: "Turn on what you need",
    body: "Each product attaches to the catalog you already have. No second integration.",
  },
] as const;

export default function Home() {
  return (
    <main className="relative flex w-full flex-1 flex-col text-zinc-100">
      {/* The front door: the one hero at `lead` size, with the animated
          lattice rather than the quiet one. */}
      <PageHero
        size="lead"
        hex="hero"
        glow={false}
        eyebrow={brand.eyebrow}
        title={
          <>
            {brand.taglineLead}
            <br />
            <span className="text-zinc-500">{brand.taglineFollow}</span>
          </>
        }
        lede={brand.description}
        actions={
          <>
            <Link
              href={appHref("/new?plan=free")}
              className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Start for free
            </Link>
            <Link
              href="/products"
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              See what&apos;s inside
            </Link>
          </>
        }
        footnote="Free to start, no card required. Self-host it free, forever."
      />

      {/* Products */}
      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {products.map(({ name, href, icon: Icon, body }) => (
            <Link key={name} href={href} className="group flex flex-col p-8 transition hover:bg-white/2">
              <div className="flex items-center gap-2.5">
                <Icon className="h-5 w-5 text-teal-400" aria-hidden />
                <h2 className="text-base font-semibold text-zinc-100">{name}</h2>
                <ArrowRight
                  className="ml-auto h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-teal-400"
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
            </Link>
          ))}
        </div>
      </BleedBand>

      {/* The problem */}
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-100">
          Every tool asks you to describe the same company again.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
          The same projects. The same teams. The same people, the same
          permissions, kept in sync by hand and drifting the moment somebody
          changes jobs. Four tools means four bills, four access models, and
          four places to revoke someone on their last day.
        </p>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
          {brand.name} models it once. A project is a project everywhere,
          ownership means the same thing everywhere, and turning on the next
          product is a checkbox rather than another integration.
        </p>
      </div>

      {/* Principles */}
      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {principles.map(({ icon: Icon, title, body }) => (
            <div key={title} className="p-8">
              <Icon className="h-5 w-5 text-teal-400" aria-hidden />
              <h3 className="mt-4 text-base font-semibold text-zinc-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </BleedBand>

      {/* How it works */}
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
          Set it up once
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
          The catalog is the work. Everything after it is a product attaching to
          structure you have already described.
        </p>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {steps.map(({ step, title, body }) => (
            <div key={step}>
              <span className="font-mono text-xs text-teal-400/70">{step}</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing teaser: rendered from the registry, so it cannot drift from
          the pricing page or the invoice. */}
      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Priced so it stays boring
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Hobby is free and capped, so it can never produce an invoice. Pro
              is ${PLANS.pro.priceMonthly} a month and returns as $
              {PLANS.pro.includedUsageCents / 100} of pooled usage across every
              product. No seats, ever.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-teal-400 transition hover:text-teal-300"
            >
              See pricing <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Metered usage
            </h3>
            <dl className="mt-4 space-y-3">
              {activeMeters().map((meter) => (
                <div key={meter.id} className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm text-zinc-300">{meter.label}</dt>
                  <dd className="shrink-0 font-mono text-sm text-zinc-400">
                    {formatMeterRate(meter)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </BleedBand>

      {/* Close */}
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-100">
          {brand.taglineLead}{" "}
          <span className="text-zinc-500">{brand.taglineFollow}</span>
        </h2>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={appHref("/new?plan=free")}
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
          >
            Start for free
          </Link>
          <Link
            href="/enterprise/contact"
            className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
          >
            Talk to sales
          </Link>
        </div>
      </div>
    </main>
  );
}
