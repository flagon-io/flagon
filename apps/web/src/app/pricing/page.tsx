import type { Metadata } from "next";
import {
  BleedBand,
  brand,
  GridBackdrop,
  planIncludedEvents,
  EVENT_OVERAGE_PER_MILLION_CENTS,
} from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PricingTable } from "./pricing-table";

// Rendered from the shared catalog so the marketing copy can never drift from
// what the app actually meters. "0.5M" / "1M" and the per-1K overage rate.
const millions = (n: number) => `${n / 1_000_000}M`;
const HOBBY_EVENTS = millions(planIncludedEvents("hobby"));
const PRO_EVENTS = millions(planIncludedEvents("pro"));
const PER_1K = (EVENT_OVERAGE_PER_MILLION_CENTS / 1000 / 100).toFixed(2);

export const metadata: Metadata = {
  title: `Pricing · ${brand.name}`,
  description: `Simple, usage-based pricing for ${brand.name}. Start free.`,
};

/**
 * The marketing pricing page. The table (full-bleed layout) lives in the
 * PricingTable component; this shell provides the hero, header, footer, and
 * footnotes, and renders the SAME shared plan catalog as the in-app
 * create-organization picker.
 */
export default function PricingPage() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex-1 pb-20">
        <div className="mx-auto w-full max-w-3xl px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Simple, usage-based pricing
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base/7 text-zinc-400">
            Flag checks are free and unlimited. Every plan includes a monthly pool
            of analytics events, and you pay for usage, never for seats, so adding
            a teammate never changes the bill. Start free and self-host any time.
          </p>
        </div>

        <PricingTable />

        {/* Full-bleed strip directly under the table: the note gets the whole
            width so it sits on one line instead of wrapping for no reason. */}
        <BleedBand>
          <p className="mx-auto max-w-3xl px-6 py-4 text-center text-sm text-zinc-500">
            Flag &amp; config checks are always free and unlimited. Hobby includes{" "}
            {HOBBY_EVENTS} analytics events a month and simply pauses there, never
            a surprise bill. Pro includes {PRO_EVENTS} and bills ${PER_1K} per
            1,000 events beyond it.
          </p>
        </BleedBand>

        {/* Self-host: it exists, but make the honest case for letting us run it. */}
        <div className="mx-auto mt-20 max-w-2xl px-6 text-center">
          <h2 className="text-lg font-semibold text-zinc-100">
            Rather run it yourself?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm/7 text-zinc-400">
            Flagon is source-available and free to self-host, with no user limit.
            But then the upgrades, scaling, backups, and 3am pages are yours to
            own. The managed platform is the same Flagon without any of that, so
            your time goes to shipping, not to running a control plane.
          </p>
          <a
            href="/docs/self-hosting"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-400 transition-colors hover:text-teal-300"
          >
            Read the self-hosting guide <span aria-hidden>→</span>
          </a>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
