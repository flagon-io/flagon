import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Gauge,
  Puzzle,
  ShieldCheck,
  Split,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: `Feature Flags · ${brand.name}`,
  description: `Typed feature flags served over OpenFeature's OFREP: targeting rules, reusable segments, percentage rollouts, and no proprietary SDK to adopt.`,
};

/**
 * Feature Flags, as a marketing page.
 *
 * The argument, not the manual. Anything a reader has to DO lives in
 * /docs/feature-flags; this page's whole job is to make the case that
 * standards-based flag serving is worth switching to.
 */
const pillars = [
  {
    icon: Puzzle,
    title: "No proprietary SDK",
    body: `${brand.name} implements OFREP, the OpenFeature Remote Evaluation Protocol. You install a standard OpenFeature SDK and point it at us. Nothing in your application code is specific to ${brand.name}, which means adopting us is a config change and so is leaving.`,
  },
  {
    icon: Split,
    title: "Targeting that stays readable",
    body: "Ordered rules, reusable segments, and percentage rollouts bucketed on a stable targeting key, so the same user stays on the same side of a split. Define an audience once and share it across every flag instead of copying criteria.",
  },
  {
    icon: ShieldCheck,
    title: "Your rules never leave the server",
    body: "Client tokens are publishable and receive evaluated values only, never your targeting rules or segment definitions. Shipping a credential in a browser bundle does not ship your logic with it.",
  },
  {
    icon: Gauge,
    title: "Priced so it stays boring",
    body: "Usage-based, no seats, and conditional requests mean an unchanged configuration returns 304 and costs nothing at all. Most teams never leave their included credit.",
  },
] as const;

const capabilities = [
  "Boolean, string, integer, float, and JSON flags",
  "Ordered targeting rules with first-match-wins",
  "Reusable segments shared by every flag",
  "Percentage rollouts on a stable targeting key",
  "Server and client credentials, scoped separately",
  "Realtime invalidation stream, with polling fallback",
  "Full REST API and OpenAPI spec",
  "Self-host the whole thing, source-available",
] as const;

/**
 * Where to send someone who is sold: ours first, then the standard itself.
 *
 * The spec link is deliberately present rather than hidden. "No proprietary
 * SDK" is the page's central claim, and a claim like that is worth more when
 * the reader can go read the standard without our help.
 */
const reading = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    body: "Create a flag, get a token, and read a value from your app.",
    external: false,
  },
  {
    href: "/docs/feature-flags",
    title: "Feature Flags documentation",
    body: "Targeting rules, segments, rollouts, caching, and the SDK setup.",
    external: false,
  },
  {
    href: "https://openfeature.dev",
    title: "OpenFeature and OFREP",
    body: "The vendor-neutral standard and the evaluation protocol we serve.",
    external: true,
  },
] as const;

function ReadingRow({
  title,
  body,
  external,
}: {
  title: string;
  body: string;
  external: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{body}</p>
      </div>
      {external ? (
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-teal-400"
          aria-hidden
        />
      ) : (
        <ArrowRight
          className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-teal-400"
          aria-hidden
        />
      )}
    </>
  );
}

export default function FeatureFlagsProductPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Feature Flags"
        title={
          <>
            Ship behind flags.
            <br />
            <span className="text-zinc-500">Without the lock-in.</span>
          </>
        }
        lede={
          <>
            Typed feature flags with targeting, segments, and rollouts, served
            over the OpenFeature standard. The SDK you integrate is the one the
            spec defines, not one we wrote.
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
              href="/docs/feature-flags"
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              Read the docs
            </Link>
          </>
        }
        rule={false}
      />

      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x lg:divide-y-0">
          {pillars.map(({ icon: Icon, title, body }, index) => (
            <div
              key={title}
              className={`p-8 ${index < 2 ? "" : "sm:border-t sm:border-white/10"}`}
            >
              <Icon className="h-5 w-5 text-teal-400" aria-hidden />
              <h2 className="mt-4 text-base font-semibold text-zinc-100">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </BleedBand>

      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
        {/* minmax(0,1fr) on both tracks, not the default 1fr: a grid item's
            min-width is auto, so any long unbroken string inside a column
            widens the whole grid past the viewport rather than wrapping. */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              What you get
            </h2>
            <ul className="mt-6 space-y-3">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-start gap-2.5 text-sm leading-6 text-zinc-300"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-teal-400"
                    aria-hidden
                  />
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          {/* This column used to carry an integration snippet, which made the
              page start explaining OFREP - the manual, on the page whose job is
              the argument. Anyone convinced enough to want the code wants the
              documentation, not an excerpt of it, so the column now hands them
              off instead of teaching. */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Built on a standard, not our SDK
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              You install an OpenFeature SDK and point it at Flagon over OFREP,
              the protocol&apos;s remote evaluation spec. Both are open and
              neither is ours, so the integration you write is portable by
              construction.
            </p>

            <ul className="mt-6 divide-y divide-white/5 border border-white/10">
              {reading.map((item) => (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/2"
                    >
                      <ReadingRow {...item} />
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/2"
                    >
                      <ReadingRow {...item} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
