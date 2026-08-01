import type { Metadata } from "next";
import Link from "next/link";
import {
  BleedBand,
  brand,
  Cta,
  GridBackdrop,
  IconArrowRight,
  IconSelfHost,
  IconStandards,
  IconUsage,
  PageHero,
} from "@flagon/design";
import {
  BarChart3,
  Building2,
  Code2,
  Crosshair,
  FlaskConical,
  FolderTree,
  Layers,
  Network,
  Package,
  Rocket,
  Split,
  ToggleRight,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge, SectionHead } from "@/components/marketing";
import { SIGN_UP_URL } from "@/lib/urls";

export const metadata: Metadata = {
  title: `Products · ${brand.name}`,
  description:
    "The products you'd otherwise buy or build, on one foundation. Feature Flags is available today, with the Catalog at the center and more shipping shortly.",
};

/** The shared substrate every product plugs into. These exist today. */
const foundation: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Building2, title: "Organizations & teams", body: "Members, roles, and access, shared by everything you add." },
  { icon: FolderTree, title: "Projects", body: "Group the work for a service or team in one place." },
  { icon: Layers, title: "Environments", body: "Production, Preview, and Development, consistent everywhere." },
  { icon: Users, title: "One account", body: "A single login and one set of teams across every product." },
  { icon: Code2, title: "One API", body: "A single REST API under /v1, documented with OpenAPI." },
  { icon: BarChart3, title: "One bill", body: "Usage-based and pooled across products. Never per seat." },
];

type Product = {
  icon: LucideIcon;
  name: string;
  body: string;
  href?: string;
  tone: "core" | "available" | "soon";
  label: string;
};

const products: Product[] = [
  {
    icon: Network,
    name: "Catalog",
    tone: "core",
    label: "The core",
    href: "/docs/catalog",
    body: "The center of the platform: a live map of your services, their owners, environments, and the products attached to each one.",
  },
  {
    icon: ToggleRight,
    name: "Feature Flags",
    tone: "available",
    label: "Available",
    href: "/docs/feature-flags",
    body: "Change what your app does without a deploy. Target with rules and rollouts, evaluate over OpenFeature in any language.",
  },
  {
    icon: Rocket,
    name: "Deployments",
    tone: "soon",
    label: "Coming soon",
    body: "Ship and promote releases across environments from the same platform your flags already live on.",
  },
  {
    icon: Package,
    name: "Packages",
    tone: "soon",
    label: "Coming soon",
    body: "A private registry for your artifacts, wired straight into your projects and environments.",
  },
  {
    icon: FlaskConical,
    name: "Experiments",
    tone: "soon",
    label: "Coming soon",
    body: "Measure the impact of a rollout with metrics tied directly to the flags serving it.",
  },
];

/** Feature Flags is the product that ships today, so show its depth. */
const flagFeatures: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Code2, title: "OpenFeature-native", body: "Evaluate over OFREP with the standard OpenFeature SDK, on the server or in the browser, in any language." },
  { icon: Crosshair, title: "Targeting rules", body: "Serve the right value by attribute, segment, time, or any context an SDK sends." },
  { icon: Users, title: "Reusable segments", body: "Define an audience once and reuse it across every flag." },
  { icon: Split, title: "Percentage splits", body: "Bucket traffic deterministically across variants, so a subject stays put." },
  { icon: TrendingUp, title: "Progressive rollouts", body: "Ramp a variant to everyone on a schedule you set, automatically." },
  { icon: BarChart3, title: "Usage analytics", body: "See checks, pass rates, and staleness per flag from real exposures." },
];

const pillars = [
  { icon: IconStandards, title: "Standards, not lock-in", body: "Build on open standards where they exist, interoperate with the best where they don't. Arriving is a config change, and so is leaving." },
  { icon: IconUsage, title: "Usage, never seats", body: "Adding a teammate never changes the bill. One subscription becomes one pooled credit across whatever you use." },
  { icon: IconSelfHost, title: "Always self-hostable", body: "Source-available: run the whole platform on your own Postgres, for your own use, with no license fee." },
] as const;

export default function ProductsPage() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex-1">
        <PageHero
          eyebrow="Products"
          rule={false}
          title={
            <>
              The products you&apos;d buy or build,{" "}
              <span className="text-zinc-500">on one foundation.</span>
            </>
          }
          lede="Your projects, environments, and teams are the hub. Every product plugs into that same spine, so you learn Flagon once, pay one bill, and never stitch two vendors together again."
          actions={
            <>
              <Cta href={SIGN_UP_URL} variant="primary" size="lg" iconRight={<IconArrowRight className="size-4" />}>
                Get started
              </Cta>
              <Cta href="/docs" variant="secondary" size="lg">
                Read the docs
              </Cta>
            </>
          }
        />

        {/* The foundation: the substrate that exists today and ties it together. */}
        <BleedBand>
          <div className="px-6 py-12 sm:px-8 sm:py-14">
            <SectionHead
              eyebrow="The foundation"
              title="One spine under everything"
              lede="Products don't feel bolted together because they aren't. They all sit on the same organizations, projects, environments, and teams."
            />
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {foundation.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-teal-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
                    <p className="mt-1 text-sm/6 text-zinc-500">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BleedBand>

        {/* The product lineup: the core, what's live, and what's next. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
          <SectionHead
            eyebrow="The lineup"
            title="The Catalog is the core. Feature Flags ships on it today."
            lede="More products are landing shortly, each one arriving on the foundation you already know."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => {
              const Icon = p.icon;
              const inner = (
                <>
                  <div className="flex items-center justify-between">
                    <Icon className="size-6 text-teal-400" />
                    <Badge tone={p.tone}>{p.label}</Badge>
                  </div>
                  <h3 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-zinc-100">
                    {p.name}
                    {p.href ? (
                      <IconArrowRight className="size-4 -translate-x-1 text-teal-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    ) : null}
                  </h3>
                  <p className="mt-2 text-sm/6 text-zinc-400">{p.body}</p>
                </>
              );
              const base = "rounded-xl border p-6 transition";
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
        </section>

        {/* Feature Flags spotlight: the shipping product, in depth. */}
        <BleedBand>
          <div className="px-6 py-12 sm:px-8 sm:py-14">
            <div className="flex items-center gap-2">
              <ToggleRight className="size-5 text-teal-400" />
              <span className="font-mono text-xs tracking-[0.2em] text-teal-400/80 uppercase">
                Available today
              </span>
            </div>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Feature Flags, ready for production
            </h2>
            <p className="mt-3 max-w-2xl text-base/7 text-zinc-400">
              A complete flag product, evaluated over the open OpenFeature protocol so
              any SDK can read it with no custom glue.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {flagFeatures.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <Icon className="size-5 text-teal-400" />
                  <h3 className="mt-3 text-sm font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-1 text-sm/6 text-zinc-500">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <Cta href="/docs/feature-flags/quickstart" variant="primary" iconRight={<IconArrowRight className="size-4" />}>
                Ship your first flag
              </Cta>
              <Cta href="/docs/feature-flags" variant="secondary">
                Feature Flags docs
              </Cta>
            </div>
          </div>
        </BleedBand>

        {/* The platform promise. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-teal-400" />
                <h3 className="mt-4 text-base font-semibold text-zinc-100">{title}</h3>
                <p className="mt-2 text-sm/6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA. */}
        <BleedBand>
          <div className="flex flex-col items-start gap-6 px-6 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
                One platform. Start on it.
              </h2>
              <p className="mt-2 text-sm/6 text-zinc-400">
                Create a free organization and ship a flag today. Bring the rest of your
                stack over as each product lands.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Cta href={SIGN_UP_URL} variant="primary" size="lg" iconRight={<IconArrowRight className="size-4" />}>
                Get started
              </Cta>
              <Cta href="/enterprise" variant="secondary" size="lg">
                Talk to us
              </Cta>
            </div>
          </div>
        </BleedBand>
      </main>

      <SiteFooter />
    </>
  );
}
