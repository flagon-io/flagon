import type { Metadata } from "next";
import {
  BleedBand,
  brand,
  Cta,
  GridBackdrop,
  IconArrowRight,
  PageHero,
} from "@flagon/design";
import {
  FileText,
  Gauge,
  GitBranch,
  LifeBuoy,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionHead } from "@/components/marketing";
import { ContactForm } from "./contact-form";
import { SIGN_UP_URL } from "@/lib/urls";

export const metadata: Metadata = {
  title: `Enterprise · ${brand.name}`,
  description:
    "Flagon for teams at scale: usage-based pricing that never taxes headcount, source-available so you can self-host, and a team you can talk to directly.",
};

const values: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Gauge,
    title: "Usage, never seats",
    body: "Roll Flagon out to your whole engineering org without a per-seat bill. You pay for what you use, so onboarding the next hundred developers costs nothing extra.",
  },
  {
    icon: Server,
    title: "Run it your way",
    body: "Use the managed cloud and let us handle upgrades and uptime, or self-host the exact same Flagon on your own infrastructure. Move between them without a rewrite.",
  },
  {
    icon: ShieldCheck,
    title: "Isolation you can audit",
    body: "Every tenant is isolated at the database with row-level security, tokens are stored only as hashes, and because it is source-available, your team can verify all of it.",
  },
  {
    icon: FileText,
    title: "Pricing that fits procurement",
    body: "Volume rates, annual invoicing, and terms your finance and security teams can actually sign, tied to contracted usage rather than a headcount you have to police.",
  },
  {
    icon: LifeBuoy,
    title: "Support from the builders",
    body: "Talk to the people who write the code, with onboarding help and a direct line for when it matters, not a ticket queue and a script.",
  },
  {
    icon: GitBranch,
    title: "No lock-in, ever",
    body: "Built on open standards like OpenFeature, source-available end to end. Arriving is a config change, and so is leaving. Your data and workflows stay yours.",
  },
];

export default function EnterprisePage() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex-1">
        <PageHero
          eyebrow="Enterprise"
          rule={false}
          title={
            <>
              Flagon for your whole organization,{" "}
              <span className="text-zinc-500">on your terms.</span>
            </>
          }
          lede="Usage-based pricing that never taxes headcount, source-available so you can self-host, and a team you can talk to directly. Bring one platform to every engineer."
          actions={
            <>
              <Cta href="#contact" variant="primary" size="lg" iconRight={<IconArrowRight className="size-4" />}>
                Contact us
              </Cta>
              <Cta href="/pricing" variant="secondary" size="lg">
                View pricing
              </Cta>
            </>
          }
          footnote="A real reply from the team, usually within a business day."
        />

        {/* Why teams bring Flagon in. */}
        <BleedBand>
          <div className="px-6 py-12 sm:px-8 sm:py-14">
            <SectionHead
              eyebrow="Why Flagon"
              title="Built for teams that can't compromise"
              lede="The things that matter when a platform goes from one team to the whole company: cost that scales sanely, control over your data, and people who pick up the phone."
            />
            <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {values.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <Icon className="size-5 text-teal-400" />
                  <h3 className="mt-4 text-base font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-2 text-sm/6 text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </BleedBand>

        {/* Two ways to run it. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
          <SectionHead
            eyebrow="Deployment"
            title="Managed, self-hosted, or both"
            lede="It is the same Flagon either way. Start on the cloud and move in-house later, or run it yourself from day one."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-teal-400/20 bg-teal-400/3 p-6">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">Managed cloud</h3>
              </div>
              <p className="mt-2 flex-1 text-sm/6 text-zinc-400">
                We run the control plane. Upgrades, scaling, backups, and the 3am pages
                are ours, so your team ships instead of operating infrastructure.
              </p>
              <div className="mt-5">
                <Cta href={SIGN_UP_URL} variant="primary" iconRight={<IconArrowRight className="size-4" />}>
                  Get started free
                </Cta>
              </div>
            </div>
            <div className="flex flex-col rounded-xl border border-white/10 bg-white/2 p-6">
              <h3 className="text-base font-semibold text-zinc-100">Self-hosted</h3>
              <p className="mt-2 flex-1 text-sm/6 text-zinc-400">
                Run the whole platform on your own Postgres and network, for your own
                use, with no license fee. A real deployment, not a cut-down edition.
              </p>
              <div className="mt-5">
                <Cta href="/docs/self-hosting" variant="secondary" iconRight={<IconArrowRight className="size-4" />}>
                  Self-hosting guide
                </Cta>
              </div>
            </div>
          </div>
        </section>

        {/* Contact form -> leads pipeline (no inbox to babysit). */}
        <BleedBand>
          <div id="contact" className="scroll-mt-24 px-6 py-16 sm:px-8 sm:py-20">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
              <div className="max-w-md">
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                  Let&apos;s talk about your team
                </h2>
                <p className="mt-4 text-base/7 text-zinc-400">
                  Tell us what you&apos;re building and how your team works. We&apos;ll
                  help you find the right footing, whether that&apos;s the managed cloud,
                  self-hosting, or a contract that fits your organization.
                </p>
                <p className="mt-4 text-sm/6 text-zinc-500">
                  Prefer to explore first? The{" "}
                  <Link href="/docs" className="text-teal-400 transition-colors hover:text-teal-300">
                    docs
                  </Link>{" "}
                  and{" "}
                  <Link href="/pricing" className="text-teal-400 transition-colors hover:text-teal-300">
                    pricing
                  </Link>{" "}
                  are a good place to start.
                </p>
              </div>
              <ContactForm />
            </div>
          </div>
        </BleedBand>
      </main>

      <SiteFooter />
    </>
  );
}
