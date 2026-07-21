import type { Metadata } from "next";
import { BadgeCheck, Building2, Rocket } from "lucide-react";
import { brand } from "@/lib/brand";
import { PLANS } from "@/lib/plans";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";
import { ContactSalesForm } from "./contact-sales-form";

export const metadata: Metadata = {
  title: `Talk to sales · ${brand.name}`,
  description: `Talk to the ${brand.name} team about Enterprise: fixed pricing from your usage estimates, no hard caps, priority support.`,
};

const points = [
  {
    icon: Rocket,
    title: "What you'll get",
    body: "A walkthrough of the platform, and fixed pricing shaped from your usage estimates.",
  },
  {
    icon: Building2,
    title: "Who it's for",
    body: "Teams that need predictable invoices, procurement-friendly terms, and no hard caps on production workloads.",
  },
  {
    icon: BadgeCheck,
    title: "Why it's worth it",
    body: "Everything in Pro, plus priority support and onboarding. Usage is reviewed against your agreement, never cut off.",
  },
] as const;

/**
 * Enterprise contact.
 *
 * Built from the same two pieces as every other marketing page: the shared
 * hero, then a band ruled edge to edge. It used to be a bespoke full-bleed
 * two-column grid with its own gradient panel, which was written before the
 * page grid existed and never joined it - the left panel ran to the viewport
 * edge while the site's column rules, the header, and the footer all sat on a
 * different set of edges, and `flex-1` stretched the whole thing to the
 * viewport leaving a screen of dead space under a short form.
 *
 * The form column is given slightly more width than the pitch column. Inputs
 * have a minimum comfortable size that prose does not, so an even split makes
 * the fields feel cramped while the copy floats.
 */
export default function EnterpriseContactPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Enterprise"
        title="Talk to our sales team"
        lede="Tell us what you're running and we'll come back with a number. Fixed pricing shaped from your usage estimates, no hard caps, and support that answers."
        rule={false}
      />

      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:divide-x lg:divide-y-0">
          <div className="p-8 sm:p-10 lg:p-12">
            <div className="space-y-8">
              {points.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center border border-teal-500/20 bg-teal-500/10 text-teal-300"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">
                      {title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-10 border-t border-white/5 pt-6 text-sm leading-6 text-zinc-500">
              Not enterprise-sized yet? Pro is ${PLANS.pro.priceMonthly}/month
              and self-serve.
            </p>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <p className="mb-6 font-mono text-xs text-zinc-500">
              Fields marked * are required.
            </p>
            <ContactSalesForm />
          </div>
        </div>
      </BleedBand>
    </div>
  );
}
