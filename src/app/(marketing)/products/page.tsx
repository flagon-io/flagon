import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Flag, Layers, Rocket } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: `Products · ${brand.name}`,
  description: `The products on ${brand.name}: a catalog of your projects, teams, and ownership, with feature flags built on top. One login, one bill, one foundation.`,
};

/**
 * The products index: what you can actually use today, and the argument for
 * why they sit on one substrate.
 *
 * MARKETING, not documentation. This page exists to make the case; the docs
 * explain the mechanics. Linking straight to docs from the nav (which is what
 * the footer used to do) skips the case entirely and asks people to evaluate a
 * product by reading its reference manual.
 */
const products = [
  {
    name: "Catalog",
    href: "/products/catalog",
    icon: BookOpen,
    tagline: "Everything you have, and who is responsible for it.",
    body: "Projects, teams, ownership, and per-project access. The foundation every other product attaches to, so you model your organization once instead of once per tool.",
    points: [
      "Projects with a README, owners, and access roles",
      "Ownership by team or by person, separate from permissions",
      "No seat pricing, ever",
    ],
  },
  {
    name: "Feature Flags",
    href: "/products/feature-flags",
    icon: Flag,
    tagline: "Standard OpenFeature, no proprietary client.",
    body: "Typed flags with targeting rules, reusable segments, and percentage rollouts, served over OFREP. You integrate a standard OpenFeature SDK, so nothing about your application code is specific to us.",
    points: [
      "OFREP: any OpenFeature SDK works",
      "Targeting rules, segments, and rollouts",
      "Conditional requests, so revalidation is free",
    ],
  },
] as const;

export default function ProductsPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Products"
        title={
          <>
            One platform.
            <br />
            <span className="text-zinc-500">Not five subscriptions.</span>
          </>
        }
        lede={
          <>
            Every product here shares the same organizations, projects, teams,
            and access model, and draws on the same pooled usage credit. Adding
            the next one costs you a checkbox, not another vendor, another
            login, and another invoice.
          </>
        }
        actions={
          <>
            <Link
              href={appHref("/new?plan=free")}
              className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Start for free
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              See pricing
            </Link>
          </>
        }
        rule={false}
      />

      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {products.map(({ name, href, icon: Icon, tagline, body, points }) => (
            <Link
              key={name}
              href={href}
              className="group flex flex-col p-8 transition hover:bg-white/2"
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-5 w-5 text-teal-400" aria-hidden />
                <h2 className="text-lg font-semibold text-zinc-100">{name}</h2>
                <ArrowRight
                  className="ml-auto h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-teal-400"
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-300">
                {tagline}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
              <ul className="mt-6 space-y-2">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-6 text-zinc-400"
                  >
                    <span
                      aria-hidden
                      className="mt-2.5 h-px w-3 shrink-0 bg-teal-500/50"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </BleedBand>

      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
        <div className="flex items-start gap-3">
          <Layers
            className="mt-0.5 h-5 w-5 shrink-0 text-teal-400"
            aria-hidden
          />
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
              Why one platform beats four tools
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Every tool you add asks you to re-describe the same organization:
              the same projects, the same teams, the same people, the same
              permissions, kept in sync by hand and drifting the moment somebody
              changes jobs. {brand.name} models that once. A project is a
              project everywhere, ownership means the same thing everywhere, and
              turning on the next product does not start another integration.
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The bill works the same way. One subscription returns as one
              pooled usage credit you spend on whichever products you actually
              use, rather than four separate minimums you pay whether you use
              them or not.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
          >
            See pricing
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
          >
            <span className="inline-flex items-center gap-2">
              <Rocket className="h-4 w-4" aria-hidden /> Get started
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
