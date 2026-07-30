import type { Metadata } from "next";
import { brand, GridBackdrop } from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PricingTable } from "./pricing-table";

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
        <div className="mx-auto w-full max-w-3xl px-6 pt-12 pb-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Simple, usage-based pricing
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-400">
            A monthly base that goes toward your usage, pooled across every
            product. You pay for usage, never for seats, so adding a teammate
            never changes the bill. Start free and self-host any time.
          </p>
        </div>

        <PricingTable />

        <div className="mx-auto mt-10 max-w-2xl px-6 text-center text-sm text-zinc-500">
          <p>
            Your plan fee is a usage credit. You are only billed beyond it, and
            spending limits keep a bill from ever surprising you.
          </p>
        </div>

        {/* Self-host: it exists, but make the honest case for letting us run it. */}
        <div className="mx-auto mt-20 max-w-2xl px-6 text-center">
          <h2 className="text-lg font-semibold text-zinc-100">
            Rather run it yourself?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-zinc-400">
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
