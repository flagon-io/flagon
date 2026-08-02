import Link from "next/link";
import {
  FlaskConical,
  Network,
  Package,
  Rocket,
  Siren,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import {
  BleedBand,
  brand,
  Cta,
  GridBackdrop,
  HexField,
  IconArrowRight,
  IconDiscord,
  IconSelfHost,
  IconStandards,
  IconUsage,
} from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge, SectionHead } from "@/components/marketing";
import { DISCORD_URL, SIGN_UP_URL } from "@/lib/urls";

const pillars = [
  {
    icon: IconStandards,
    title: "Standards, not lock-in",
    body: "We build on open standards wherever they exist and stay interoperable with the best ones where they don't. You integrate against the ecosystem, not us, so arriving is a config change and so is leaving.",
  },
  {
    icon: IconUsage,
    title: "Usage, never seats",
    body: "Adding a teammate never changes the bill. One subscription returns as one pooled credit you spend on whichever products you actually use.",
  },
  {
    icon: IconSelfHost,
    title: "Always self-hostable",
    body: "Source-available: run it on your own Postgres, for your own use, with no license fee. A real deployment, not a cut-down demo.",
  },
] as const;

type LineupItem = {
  icon: LucideIcon;
  name: string;
  body: string;
  href?: string;
  tone: "core" | "available" | "soon";
  label: string;
};

const lineup: LineupItem[] = [
  {
    icon: Network,
    name: "Catalog",
    tone: "core",
    label: "The core",
    href: "/docs/catalog",
    body: "A live map of your services, their owners, and the products on each.",
  },
  {
    icon: ToggleRight,
    name: "Feature Flags",
    tone: "available",
    label: "Available",
    href: "/docs/feature-flags",
    body: "Change what your app does without a deploy, over OpenFeature.",
  },
  {
    icon: FlaskConical,
    name: "Experiments",
    tone: "soon",
    label: "Soon",
    body: "Measure a rollout's impact, tied to the flags serving it.",
  },
  {
    icon: Rocket,
    name: "Deployments",
    tone: "soon",
    label: "Soon",
    body: "Ship and promote releases across environments.",
  },
  {
    icon: Package,
    name: "Packages",
    tone: "soon",
    label: "Soon",
    body: "A private registry, wired straight into your projects.",
  },
  {
    icon: Siren,
    name: "Incidents & on-call",
    tone: "soon",
    label: "Soon",
    body: "Declare incidents, run on-call, and keep a status page.",
  },
];

export default function Home() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero. No closing border: the pillars band below draws its own top
            rule, and two hairlines with nothing between them read as one heavy
            line. */}
        <section className="relative overflow-hidden">
          <HexField variant="hero" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-150"
            style={{
              background:
                "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:px-12 sm:pt-28 lg:px-20">
            <p className="font-mono text-xs tracking-[0.25em] text-teal-400/80 uppercase">
              {brand.eyebrow}
            </p>

            <h1 className="mt-6 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-zinc-100 sm:text-6xl md:text-7xl">
              {brand.taglineLead}
              <br />
              <span className="text-zinc-500">{brand.taglineFollow}</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg/8 text-zinc-400">
              {brand.description}
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Cta
                href={SIGN_UP_URL}
                variant="primary"
                size="lg"
                iconRight={<IconArrowRight className="size-4" />}
              >
                Get started
              </Cta>
              <Cta href="/docs" variant="secondary" size="lg">
                Read the docs
              </Cta>
            </div>
          </div>
        </section>

        {/* Why it's different */}
        <BleedBand>
          <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-8">
                <Icon className="size-5 text-teal-400" />
                <h2 className="mt-4 text-base font-semibold text-zinc-100">
                  {title}
                </h2>
                <p className="mt-2 text-sm/6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </BleedBand>

        {/* The product lineup: what the platform is, concretely. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
          <SectionHead
            eyebrow="The lineup"
            title="One platform. A growing set of products."
            lede="The Catalog is the core. Feature Flags ships on it today, with more landing every week, each one on the same foundation you already know."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lineup.map((p) => {
              const Icon = p.icon;
              const inner = (
                <>
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-teal-400" />
                    <Badge tone={p.tone}>{p.label}</Badge>
                  </div>
                  <h3 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-zinc-100">
                    {p.name}
                    {p.href ? (
                      <IconArrowRight className="size-4 -translate-x-1 text-teal-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    ) : null}
                  </h3>
                  <p className="mt-1.5 text-sm/6 text-zinc-400">{p.body}</p>
                </>
              );
              const base = "rounded-xl border p-5 transition";
              return p.href ? (
                <Link
                  key={p.name}
                  href={p.href}
                  className={`${base} group border-white/10 bg-white/2 hover:border-teal-400/30 hover:bg-white/4`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={p.name} className={`${base} border-white/5 bg-white/1`}>
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="mt-8">
            <Cta
              href="/products"
              variant="secondary"
              iconRight={<IconArrowRight className="size-4" />}
            >
              See all products
            </Cta>
          </div>
        </section>

        {/* Built in the open */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-6 py-20 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-20">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Built in the open
            </h2>
            <p className="mt-3 text-sm/6 text-zinc-400">
              Flagon is source-available. Read every line, run the whole
              platform on your own infrastructure, and shape where it goes. No
              cut-down community edition, no bait and switch.
            </p>
          </div>
          <Cta
            href={brand.repo}
            target="_blank"
            rel="noreferrer noopener"
            variant="secondary"
            size="lg"
            iconRight={<IconArrowRight className="size-4" />}
          >
            View the source
          </Cta>
        </div>

        {/* Community support */}
        <BleedBand outerClassName="bg-teal-950/20">
          <div className="grid bg-[radial-gradient(circle_at_10%_0%,rgba(20,184,166,0.12),transparent_40%)] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="px-8 py-14 sm:px-12 lg:px-16 lg:py-20">
              <div className="flex items-center gap-2 text-teal-400">
                <IconDiscord className="size-5" />
                <p className="font-mono text-xs tracking-[0.2em] uppercase">
                  Join the community
                </p>
              </div>
              <h2 className="mt-6 max-w-lg text-4xl/tight font-semibold tracking-tight text-zinc-100 sm:text-5xl">
                Follow Flagon from the start.
              </h2>
              <p className="mt-5 max-w-lg text-base/7 text-zinc-400">
                Join the Flagon Discord for community support, to follow
                development, and to help shape what we build next.
              </p>
              <Cta
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer noopener"
                variant="primary"
                size="lg"
                icon={<IconDiscord className="size-4" />}
                iconRight={<IconArrowRight className="size-4" />}
                className="mt-8"
              >
                Join the Discord
              </Cta>
            </div>

            <ol className="flex flex-col justify-center border-t border-white/10 p-8 sm:px-12 lg:border-t-0 lg:border-l lg:px-14 lg:py-12">
              {[
                {
                  title: "Community support",
                  body: "Get help, compare notes with other builders, and talk directly with the Flagon team.",
                },
                {
                  title: "Follow development",
                  body: "See product progress, release notes, and what the team is working on next.",
                },
                {
                  title: "Help shape Flagon",
                  body: "Share feedback, request capabilities, and influence the products we build.",
                },
              ].map((item, index) => (
                <li
                  key={item.title}
                  className="grid grid-cols-[2rem_1fr] gap-4 border-t border-white/10 py-6 first:border-t-0"
                >
                  <span className="font-mono text-xs text-zinc-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold text-zinc-100">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm/6 text-zinc-400">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </BleedBand>
      </main>

      <SiteFooter />
    </>
  );
}
