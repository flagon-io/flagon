import type { Metadata } from "next";
import Link from "next/link";
import {
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
  Activity,
  BarChart3,
  Blocks,
  Bug,
  Building2,
  Cable,
  Code2,
  FileCode,
  FlaskConical,
  FolderTree,
  Gauge,
  KeyRound,
  Layers,
  LineChart,
  Logs,
  Network,
  NotebookText,
  Package,
  PieChart,
  Rocket,
  ScrollText,
  ShieldCheck,
  Signal,
  Siren,
  Smartphone,
  Smile,
  Timer,
  ToggleRight,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionHead } from "@/components/marketing";
import { SIGN_UP_URL } from "@/lib/urls";

export const metadata: Metadata = {
  title: `Products · ${brand.name}`,
  description:
    "One platform for your whole toolchain. See what's live today and what's on the roadmap, all on one foundation. Everything ships included, never a new bill. Early-access alpha.",
};

type Cell = {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  /** A short uppercase tag rendered in the cell's top-right, e.g. "Core". */
  tag?: string;
};

/** The shared substrate every product plugs into. These exist today. */
const foundation: Cell[] = [
  { icon: Building2, title: "Organizations & teams", body: "Members, roles, and access, shared by everything." },
  { icon: FolderTree, title: "Projects", body: "Group the work for a service or team." },
  { icon: Layers, title: "Environments", body: "Production, Preview, and Development, everywhere." },
  { icon: Users, title: "One account", body: "A single login across every product." },
  { icon: Code2, title: "One API", body: "A single REST API under /v1, documented with OpenAPI." },
  { icon: BarChart3, title: "One bill", body: "Usage-based and pooled. Never per seat." },
];

/** What's live on the platform right now. The Catalog is the core. */
const live: Cell[] = [
  { icon: Network, title: "Catalog", tag: "Core", href: "/docs/catalog", body: "A live map of your services, their owners, and everything attached to each one." },
  { icon: ToggleRight, title: "Feature Flags", href: "/docs/feature-flags", body: "Change what your app does without a deploy. Rules and rollouts over OpenFeature." },
  { icon: FlaskConical, title: "Experiments", href: "/docs/experiments", body: "Measure impact with metrics tied to the flags serving it. Frequentist and Bayesian." },
  { icon: Siren, title: "Incidents & on-call", href: "/docs/incidents", body: "Declare against a service, route to its team, page the on-call through escalation." },
];

type RoadmapTier = { eyebrow: string; lede: string; cols: 2 | 3 | 4; items: Cell[] };

/**
 * The roadmap is forward-looking only. Anything already live is in "Available
 * today" above, not repeated here. The tiers are HORIZONS (how close a piece
 * is), never pricing tiers: everything here ships included with Flagon when we
 * build it, on the same foundation and the same bill. "Building next" is the set
 * already scaffolded in the app (extensions of what's live); the later tiers get
 * heavier to build the further out they go.
 */
const roadmap: RoadmapTier[] = [
  {
    eyebrow: "Building next",
    lede: "Already scaffolded in the app and shipping soon. The next products to land on the foundation.",
    cols: 3,
    items: [
      { icon: Rocket, title: "Deployments", body: "Ship straight from the catalog, with the pipeline and build behind every release wired in." },
      { icon: Package, title: "Packages", body: "A private registry for packages and images, scoped to your projects and environments." },
      { icon: Logs, title: "Logs", body: "Search and tail logs from your services, in the same place you run everything else." },
      { icon: Workflow, title: "Automations", body: "Run work on events across every product: the platform's own Actions, wired to your services." },
      { icon: Signal, title: "Status pages", body: "Public and internal status, driven straight from your incidents." },
      { icon: KeyRound, title: "Secrets management", body: "Store, rotate, and reference secrets per project and environment, part of project config." },
      { icon: Smartphone, title: "Mobile app", body: "Acknowledge incidents and take your on-call pages from your phone." },
    ],
  },
  {
    eyebrow: "On the horizon",
    lede: "Bigger, standalone builds. This is where the developer-intelligence stack lands, one system instead of four subscriptions.",
    cols: 3,
    items: [
      { icon: Activity, title: "Observability", body: "Metrics, traces, and dashboards on top of the logs you already ship, OpenTelemetry-native." },
      { icon: Bug, title: "Error tracking", body: "Group exceptions against the service and release that caused them." },
      { icon: Gauge, title: "SLO management", body: "Define SLOs and spend error budgets against real traffic." },
      { icon: LineChart, title: "Delivery & DORA metrics", body: "Lead time, deploy frequency, and MTTR from the pipelines and incidents you already run." },
      { icon: Smile, title: "Developer experience", body: "Surveys and signals that show where developers lose time, and whether changes help." },
      { icon: PieChart, title: "Engineering investment", body: "See where engineering effort goes across teams, initiatives, and the roadmap." },
      { icon: Timer, title: "Load & synthetic testing", body: "Probe critical paths and catch regressions before users do." },
      { icon: NotebookText, title: "Work tracking & docs", body: "Link issues, docs, and ownership to the services they describe." },
    ],
  },
  {
    eyebrow: "Eventually",
    lede: "Longer horizon and heavier to build. Real ambitions, further out, and not committed until the ground under them is solid.",
    cols: 4,
    items: [
      { icon: FileCode, title: "Infrastructure as code", body: "Review infra changes alongside the services they belong to." },
      { icon: Wallet, title: "Cost & FinOps", body: "Attribute cloud spend to the teams and services that drive it." },
      { icon: ScrollText, title: "Policy as code", body: "Guardrails on infrastructure and deploys, enforced automatically." },
      { icon: ShieldCheck, title: "Supply-chain & SBOM", body: "Dependency, SBOM, and vulnerability signals on every project." },
    ],
  },
];

/** How the roadmap works: the promise attached to every item above. */
const roadmapPromise = [
  { icon: Blocks, title: "One foundation", body: "Each product lands on the same projects, environments, and teams. No second system to learn." },
  { icon: Wallet, title: "One bill, no new tier", body: "New products don't cost extra to unlock. Your usage-based bill just covers more of your stack." },
  { icon: Rocket, title: "Included when it ships", body: "You don't earn these by growing. When we build a product, it's part of Flagon." },
] as const;

const pillars = [
  { icon: IconStandards, title: "Standards, not lock-in", body: "Build on open standards where they exist, interoperate with the best where they don't. Arriving is a config change, and so is leaving." },
  { icon: IconUsage, title: "Usage, never seats", body: "Adding a teammate never changes the bill. One subscription becomes one pooled credit across whatever you use." },
  { icon: IconSelfHost, title: "Always self-hostable", body: "Source-available: run the whole platform on your own Postgres, for your own use, with no license fee." },
] as const;

/**
 * A small square node marking a crossing in the cell grid, in the same drafting
 * language as the design system's CornerMark. Sits on a cell's top-left corner;
 * every interior grid crossing is exactly one cell's top-left, so one node per
 * cell tiles the whole lattice. Multi-column only, so a stacked mobile list of
 * cells stays clean.
 */
function Node() {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-px -left-px z-10 hidden sm:block">
      <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 border border-white/30 bg-background" />
    </span>
  );
}

const COLS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * A schematic grid of cells: sharp hairline rules, a node at every crossing, no
 * rounded boxes and no fills. Each cell draws its own right/bottom rule and the
 * container closes the top/left, so a ragged final row still reads clean.
 */
function CellGrid({ cells, cols }: { cells: Cell[]; cols: 2 | 3 | 4 }) {
  return (
    <div className={`grid grid-cols-1 border-t border-l border-white/10 ${COLS[cols]}`}>
      {cells.map((c) => (
        <CellBox key={c.title} cell={c} />
      ))}
    </div>
  );
}

/** One cell: icon, optional tag, title (with a hover arrow when linked), a line. */
function CellBox({ cell }: { cell: Cell }) {
  const Icon = cell.icon;
  const inner = (
    <>
      <Node />
      <div className="flex items-start justify-between">
        <Icon className="size-5 text-teal-400" />
        {cell.tag ? (
          <span className="border border-violet-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-violet-300 uppercase">
            {cell.tag}
          </span>
        ) : null}
      </div>
      <h3 className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
        {cell.title}
        {cell.href ? (
          <IconArrowRight className="size-3.5 -translate-x-1 text-teal-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        ) : null}
      </h3>
      <p className="mt-1.5 text-sm/6 text-zinc-500">{cell.body}</p>
    </>
  );
  const base = "relative border-r border-b border-white/10 p-6";
  return cell.href ? (
    <Link href={cell.href} className={`${base} group transition-colors hover:bg-white/2`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** A Cloudflare-style section label: mono, uppercase, with a rule running out. */
function GridLabel({ eyebrow, lede }: { eyebrow: string; lede?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        <p className="font-mono text-xs tracking-[0.2em] text-teal-400/80 uppercase">{eyebrow}</p>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      {lede ? <p className="mt-3 max-w-2xl text-sm/6 text-zinc-500">{lede}</p> : null}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex-1">
        <PageHero
          eyebrow="Products"
          title={
            <>
              The products you&apos;d buy or build,{" "}
              <span className="text-zinc-500">on one foundation.</span>
            </>
          }
          lede="Your projects, environments, and teams are the hub. Every product is built on that same spine and designed to work together, so you learn Flagon once, pay one bill, and stop stitching a dozen vendors into a stack. One platform, built for how software gets shipped today."
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

        {/* What we have. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
          <SectionHead
            eyebrow="Available today"
            title="What's live right now"
            lede="The Catalog is the center, and these products run on it today, all on the same foundation. Early-access alpha: usable now, improving fast."
          />
          <div className="mt-10">
            <GridLabel eyebrow="Products" />
            <CellGrid cells={live} cols={2} />
          </div>
          <div className="mt-12">
            <GridLabel eyebrow="The foundation" lede="The substrate underneath every product. Products don't feel bolted together because they sit on the same organizations, projects, environments, and teams." />
            <CellGrid cells={foundation} cols={3} />
          </div>
        </section>

        {/* Where we're going: the roadmap, framed as horizons, not pricing tiers. */}
        <section className="mx-auto w-full max-w-7xl px-6 py-8 pb-20 sm:px-12 lg:px-20">
          <SectionHead
            eyebrow="The roadmap"
            title="The whole toolchain, headed to one place"
            lede="Everything a platform team wires together today, coming to Flagon on one foundation: one platform to standardize on instead of a dozen subscriptions to reconcile. Built for the way software gets made now, with AI in the loop, not bolted on. When we build each one, it lands included, one login, one API, one bill. This is direction, not dates."
          />

          {/* How the roadmap works: the promise behind every item below. This is
              the part that used to read as an "earned as you grow" upsell. It
              isn't one. */}
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-6 border-y border-white/10 py-8 sm:grid-cols-3">
            {roadmapPromise.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-teal-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-1 text-sm/6 text-zinc-500">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col gap-14">
            {roadmap.map((tier) => (
              <div key={tier.eyebrow}>
                <GridLabel eyebrow={tier.eyebrow} lede={tier.lede} />
                <CellGrid cells={tier.items} cols={tier.cols} />
              </div>
            ))}
          </div>

          {/* Integrate-or-replace: the counterweight to a roadmap this broad. You
              never have to rip out a vendor you already run to standardize on
              Flagon. Deliberately unnamed vendors: the app's integrations hub
              groups by capability, not by brand. */}
          <div className="mt-16 border border-white/10 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <span className="grid size-10 shrink-0 place-items-center border border-teal-400/25 bg-teal-400/5 text-teal-400">
                <Cable className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Built to augment the stack you already run.
                </h3>
                <p className="mt-2 max-w-3xl text-sm/6 text-zinc-400">
                  Flagon is one platform, designed together, not a dozen tools bolted on. And every
                  area on this roadmap is a choice, not a mandate. Adopt the Flagon product, or
                  connect the vendor you already run: two years left on a contract for your pager,
                  your observability, or your source host? We integrate with it directly, so you
                  standardize on Flagon without ripping anything out. Replace what you want, augment
                  the rest.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-12 max-w-2xl text-sm/6 text-zinc-500">
            Want a say in what lands next? The roadmap follows what teams actually use, so{" "}
            <a href={brand.discord} target="_blank" rel="noreferrer noopener" className="text-teal-300 hover:underline">
              tell us on Discord
            </a>
            .
          </p>
        </section>

        {/* The platform promise. */}
        <section className="mx-auto w-full max-w-7xl border-t border-white/10 px-6 py-20 sm:px-12 lg:px-20">
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
        <section className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-6 py-14 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-20">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
                One platform. Start on it.
              </h2>
              <p className="mt-2 text-sm/6 text-zinc-400">
                Create a free organization, map your services, and turn on the products your
                team needs today. Bring the rest of your stack over as each one lands.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Cta href={SIGN_UP_URL} variant="primary" size="lg" iconRight={<IconArrowRight className="size-4" />}>
                Get started
              </Cta>
              <Cta href="/docs" variant="secondary" size="lg">
                Read the docs
              </Cta>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
