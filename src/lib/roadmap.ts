import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Flag,
  FlaskConical,
  GitBranch,
  Megaphone,
  Settings2,
  Webhook,
} from "lucide-react";

/**
 * The product ROADMAP - pure data, importable from client or server.
 *
 * This is deliberately a different list from brand.products. brand.products is
 * "what ships today," rendered on the homepage as a claim you can act on right
 * now; listing an unbuilt product there reads as a promise. This file is the
 * opposite by design: it is explicitly the roadmap, so a not-yet-shipped
 * product is honest here precisely because the surface says "coming," never
 * "available."
 *
 * ONE rule keeps the two in sync without a test: a product graduates from
 * `committed`/`building` to `live` HERE and moves into brand.products in the
 * SAME change its real page ships. Until then it only ever appears under a
 * roadmap or coming-soon heading.
 *
 * Scope is tenant-facing PRODUCTS only - things a customer integrates into
 * their own software or publishes to their own users. Account/platform
 * capabilities (SSO into Flagon, an audit log of Flagon actions, roles on
 * Flagon projects) are NOT products in this sense and never belong on this
 * list; they live in the Enterprise and account story instead.
 *
 * Copy rule: describe what the product does for the reader. Do NOT name the
 * incumbents it competes with - a marketing page that lists rivals reads as
 * derivative and does their positioning for them. Hosts we connect TO (GitHub,
 * GitLab, and whatever a customer runs themselves) are fair game to name: they
 * are platforms we integrate with and augment, not competitors we are
 * answering. Name none of them as THE product, though - the source product is
 * host-agnostic by design, so it is "Repositories," not any one vendor.
 */

export type RoadmapStatus = "live" | "building" | "committed" | "exploring";

export type RoadmapProduct = {
  name: string;
  status: RoadmapStatus;
  icon: LucideIcon;
  /** One line, the promise. */
  tagline: string;
  /** A sentence or two of what it is. */
  blurb: string;
  /** Set once the product ships: its own page. */
  href?: string;
  /** The plane of the platform it belongs to. */
  plane: string;
};

/**
 * Display metadata per status. `badge` is the terse word for a coming-soon
 * pill ("Next"/"Soon"); `label` is the fuller word for a section header.
 */
export const STATUS_META: Record<
  RoadmapStatus,
  { label: string; badge: string; dot: string; icon: string }
> = {
  live: {
    label: "Live",
    badge: "Live",
    dot: "bg-teal-400",
    icon: "text-teal-400",
  },
  building: {
    label: "In progress",
    badge: "Next",
    dot: "bg-amber-400",
    icon: "text-amber-400",
  },
  committed: {
    label: "Committed",
    badge: "Soon",
    dot: "bg-sky-400",
    icon: "text-sky-400",
  },
  exploring: {
    label: "Exploring",
    badge: "Exploring",
    dot: "bg-zinc-600",
    icon: "text-zinc-500",
  },
};

/** Roadmap page section order, most-shipped first. */
export const STATUS_ORDER: RoadmapStatus[] = [
  "live",
  "building",
  "committed",
  "exploring",
];

export const ROADMAP: RoadmapProduct[] = [
  {
    name: "Catalog",
    status: "live",
    icon: BookOpen,
    tagline: "Everything you have, and who's responsible for it.",
    blurb:
      "Projects, teams, ownership, and per-project access. The foundation every other product attaches to, so you model your organization once instead of once per tool.",
    href: "/products/catalog",
    plane: "Foundation",
  },
  {
    name: "Feature Flags",
    status: "live",
    icon: Flag,
    tagline: "Standard OpenFeature, no proprietary client.",
    blurb:
      "Typed flags with targeting rules, reusable segments, and percentage rollouts, served over OFREP. Flag usage analytics are included, not sold apart.",
    href: "/products/feature-flags",
    plane: "Delivery & experimentation",
  },
  {
    name: "Experiments",
    status: "building",
    icon: FlaskConical,
    tagline: "Ship it to 10%. Keep what wins.",
    blurb:
      "A/B and multivariate tests on the flags you already serve. Assignment from your existing segments, results from the exposure events you already send. No new SDK, no second integration.",
    plane: "Delivery & experimentation",
  },
  {
    name: "Repositories",
    status: "committed",
    icon: GitBranch,
    tagline: "Connect your source to your projects.",
    blurb:
      "Link the repositories a project ships from, one mono-repo or many services, wherever they live: GitHub, GitLab, or a host you run yourself. Flagon ties source to project so flags, configuration, and access line up with the code they touch, adding the project layer on top of the platform you already push to.",
    plane: "Source & repositories",
  },
  {
    name: "Project Configuration",
    status: "committed",
    icon: Settings2,
    tagline: "Environment variables and secrets, per environment.",
    blurb:
      "Configuration and secrets scoped to production, preview, and development, and pulled straight into your app with the CLI. Governed by the same access model as everything else, so there is no second vault to keep in sync.",
    plane: "Configuration & environments",
  },
  {
    name: "Product Analytics",
    status: "exploring",
    icon: BarChart3,
    tagline: "Events, funnels, and retention on the pooled credit.",
    blurb:
      "Product analytics for your app, metered as the same events as everything else. A natural pairing with Experiments, and a real bet rather than a given.",
    plane: "Analytics",
  },
  {
    name: "Status Page",
    status: "exploring",
    icon: Activity,
    tagline: "A public status page on your own domain.",
    blurb:
      "Somewhere your customers can check when something is wrong, published on your domain through the same catalog and the domains stack Flagon already runs.",
    plane: "Publishing",
  },
  {
    name: "Changelog",
    status: "exploring",
    icon: Megaphone,
    tagline: "Public ship notes, on your own domain.",
    blurb:
      "Release notes authored from the same catalog and served on your domain, so telling your users what changed is not another subscription.",
    plane: "Publishing",
  },
  {
    name: "Webhooks & Events",
    status: "exploring",
    icon: Webhook,
    tagline: "Subscribe to platform events, delivered, retried, and signed.",
    blurb:
      "Wire your systems to what happens in Flagon. Also the primitive several other products want internally, so it may earn its place on infrastructure grounds alone.",
    plane: "Integration",
  },
];

/** Products in a given status, in roadmap order. */
export function productsByStatus(status: RoadmapStatus): RoadmapProduct[] {
  return ROADMAP.filter((product) => product.status === status);
}

/**
 * The coming-soon marquee: what we've actually committed to build, for the
 * products page and the homepage nod. Excludes `exploring` (not a promise) and
 * `live` (already shipped and in brand.products).
 */
export function comingProducts(): RoadmapProduct[] {
  return ROADMAP.filter(
    (product) =>
      product.status === "building" || product.status === "committed",
  );
}
