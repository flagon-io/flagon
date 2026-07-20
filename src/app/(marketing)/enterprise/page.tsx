import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  FileText,
  Gauge,
  Headset,
} from "lucide-react";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Enterprise · ${brand.name}`,
  description: `${brand.name} Enterprise: fixed pricing from your usage estimates, no hard caps, priority support, and procurement-friendly terms.`,
};

const pillars = [
  {
    icon: Gauge,
    title: "Fixed, predictable pricing",
    body: "Your contract is priced from your usage estimates: one number your finance team can plan around, reviewed together as you grow.",
  },
  {
    icon: BadgeCheck,
    title: "No hard caps, ever",
    body: "Production never stops at a limit. Usage beyond your envelope is a conversation at renewal, not an outage at 2am.",
  },
  {
    icon: Headset,
    title: "Priority support and onboarding",
    body: "A direct line to the people who build the platform, from rollout planning to the incident you hope never happens.",
  },
  {
    icon: FileText,
    title: "Procurement-friendly",
    body: "Invoicing, security review, custom terms, and an uptime SLA. The paperwork side handled the way your org needs it.",
  },
] as const;

/**
 * Enterprise landing (`/enterprise`): the marketing blurb. Deliberately
 * lean until there are customers and numbers to show; the real action is
 * the contact flow at /enterprise/contact.
 */
export default function EnterprisePage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-150"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-20">
        {/* Hero */}
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            Enterprise
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-100 sm:text-6xl">
            The whole platform,
            <br />
            <span className="text-zinc-500">on your terms.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">
            Everything in Pro, with fixed pricing from your usage estimates,
            no hard caps, and support that answers. Built for teams where the
            platform going down is not an option.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/enterprise/contact"
              className="inline-block rounded-full bg-teal-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Contact sales
            </Link>
            <Link
              href="/pricing"
              className="inline-block rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
            >
              View pricing
            </Link>
          </div>
        </div>

        {/* Pillars */}
        <div className="mt-20 grid grid-cols-1 divide-y divide-white/10 border border-white/10 bg-white/2 sm:grid-cols-2 sm:divide-y-0">
          {pillars.map(({ icon: Icon, title, body }, index) => (
            <div
              key={title}
              className={`p-8 ${index >= 2 ? "sm:border-t sm:border-white/10" : ""} ${index % 2 === 1 ? "sm:border-l sm:border-white/10" : ""}`}
            >
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center border border-teal-500/20 bg-teal-500/10 text-teal-300"
              >
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-base font-semibold text-zinc-100">
                {title}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* Closing CTA */}
        <div className="relative mt-20 overflow-hidden border border-white/10 px-6 py-14 text-center">
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
              Let&apos;s shape your contract.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Tell us what you&apos;re running and we&apos;ll come back with a
              number, not a call tree.
            </p>
            <div className="mt-8">
              <Link
                href="/enterprise/contact"
                className="inline-block rounded-full bg-teal-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
