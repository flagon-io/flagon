import type { Metadata } from "next";
import { BleedBand, brand, GridBackdrop, PageHero } from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PricingTable } from "./pricing-table";

// We deliberately DON'T publish the included-events counts: they're usage
// allowances that move as we tune the model, and a stale "it used to be N" is a
// trap. The live number is always in the app's usage view. The one concrete price
// we quote is the per-1K overage rate, and it now lives INSIDE the Pro card (see
// pricing-table.tsx) so the scaling from the $50 base is right there.

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
        <PageHero
          eyebrow="Pricing"
          rule={false}
          title={
            <>
              Simple, usage-based{" "}
              <span className="text-zinc-500">pricing.</span>
            </>
          }
          lede="One bill for everything you build on Flagon. Every product meters into a shared monthly usage pool, and you pay for usage, never for seats, so adding a teammate never changes the bill. Start free and self-host any time."
        />

        <PricingTable />

        {/* Full-bleed strip directly under the table: the note gets the whole
            width so it sits on one line instead of wrapping for no reason. */}
        <BleedBand>
          <p className="mx-auto max-w-3xl px-6 py-10 text-center text-sm/7 text-zinc-500">
            You pay for the usage events your products generate, never for seats.
            Hobby includes a free monthly allowance and simply pauses there, never a
            surprise bill. Pro includes your monthly usage and only charges for what
            you send beyond it.
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
