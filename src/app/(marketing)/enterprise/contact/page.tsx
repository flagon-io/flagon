import type { Metadata } from "next";
import { BadgeCheck, Building2, Rocket } from "lucide-react";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { PLANS } from "@/lib/plans";
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

/** Enterprise contact - `/enterprise/contact`. Split layout: gradient pitch
 * panel on the left, lead form on the right. Submissions land in the leads
 * table for internal follow-up. */
export default function EnterpriseContactPage() {
  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
      {/* Pitch panel */}
      <div className="relative overflow-hidden border-r border-white/10 bg-[#07100f] px-6 py-16 sm:px-12 lg:px-20 lg:py-28">
        {/* Ambient gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 0% 100%, rgba(13,148,136,0.35) 0%, rgba(13,148,136,0.12) 40%, transparent 70%), radial-gradient(60% 50% at 100% 0%, rgba(45,212,191,0.10) 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-xl lg:ml-auto lg:mr-8">
          <FlagonMark className="h-10 w-10" />
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.25em] text-teal-400/80">
            Enterprise
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100">
            Talk to our sales team
          </h1>

          <div className="mt-12 space-y-9">
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
                  <p className="mt-1 max-w-md text-sm leading-6 text-zinc-400">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-14 max-w-md border-t border-white/5 pt-6 text-sm leading-6 text-zinc-500">
            Not enterprise-sized yet? Pro is ${PLANS.pro.priceMonthly}/month
            and self-serve.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-start justify-center px-6 py-16 sm:px-12 lg:px-20 lg:py-28">
        <div className="w-full max-w-xl lg:ml-8 lg:mr-auto">
          <p className="mb-6 text-xs text-zinc-500">
            All fields marked with an asterisk (*) are required.
          </p>
          <ContactSalesForm />
        </div>
      </div>
    </div>
  );
}
