import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, FileText, Gauge, Headset } from "lucide-react";
import { brand } from "@/lib/brand";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: `Enterprise · ${brand.name}`,
  description: `${brand.name} Enterprise is coming soon: fixed pricing from your usage estimates, no hard caps, priority support, and procurement-friendly terms. Join the waitlist.`,
};

const pillars = [
  {
    icon: Gauge,
    title: "Fixed, predictable pricing",
    body: "A contract priced from your usage estimates: one number your finance team can plan around, reviewed together as you grow.",
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
 * Enterprise landing (`/enterprise`): a coming-soon page while we focus the
 * alpha on Hobby and Pro. The pillars describe where Enterprise is headed; the
 * only action is joining the waitlist. When Enterprise ships, this page grows a
 * real contact flow again.
 */
export default function EnterprisePage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Enterprise
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
              Coming soon
            </span>
          </span>
        }
        title={
          <>
            The whole platform,
            <br />
            <span className="text-zinc-500">on your terms.</span>
          </>
        }
        lede={
          <>
            Everything in Pro, with fixed pricing from your usage estimates, no
            hard caps, and support that answers. We&apos;re finishing it now —
            leave your email and we&apos;ll tell you the moment it&apos;s ready.
          </>
        }
        actions={
          <>
            <a
              href="#waitlist"
              className="inline-block rounded-full bg-teal-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Get notified
            </a>
            <Link
              href="/pricing"
              className="inline-block rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
            >
              View pricing
            </Link>
          </>
        }
        rule={false}
      />

      {/* Pillars, ruled edge to edge like every other section on the site. */}
      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-y-0">
          {pillars.map(({ icon: Icon, title, body }, index) => (
            <div
              key={title}
              className={`p-10 ${index >= 2 ? "sm:border-t sm:border-white/10" : ""} ${index % 2 === 1 ? "sm:border-l sm:border-white/10" : ""}`}
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
      </BleedBand>

      <div className="relative mx-auto w-full max-w-7xl px-6 pb-24 sm:px-12 lg:px-20">
        {/* Waitlist */}
        <div
          id="waitlist"
          className="relative mt-20 overflow-hidden border border-white/10 px-6 py-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 100% at 50% 100%, rgba(13,148,136,0.25) 0%, rgba(13,148,136,0.08) 50%, transparent 100%)",
            }}
          />
          <div className="relative mx-auto max-w-lg text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
              Enterprise is coming soon.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Running Flagon at scale and want a fixed price with an SLA? Join
              the waitlist and we&apos;ll reach out as soon as it&apos;s ready.
              In the meantime, Pro has no hard caps and no seat pricing.
            </p>
            <div className="mt-8 text-left">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
