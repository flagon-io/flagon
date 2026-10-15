import type { SceneName } from "@/components/art/scenes";

/**
 * The products Flagon, Inc. builds. Each one is its own thing, with its own
 * site, docs, and brand. This site gives each a page of its own at
 * /products/<id>, told in the company's voice (why we're building it, how it
 * works, how it's priced), and then sends people on to the product itself.
 * Adding a product is one object in the PRODUCTS array: the home page, the
 * products page, its landing page, and the nav all read from here.
 */

/** A friendly way into the product, out on its own site. */
export type ProductLink = {
  /** What you'll do there, as a verb ("Take a look around"). */
  label: string;
  href: string;
  /** Where it goes, as people should read it ("docs.g1t.sh"). */
  hint: string;
};

/** Where a product can be used, shown as small icons on its card. */
export type ProductSurface = "web" | "git" | "mcp" | "api";

export type ProductStep = { title: string; body: string };
export type ProductFeature = { title: string; body: string };

export type Product = {
  /** Stable key, used for the landing page URL (/products/g1t). */
  id: string;
  name: string;
  /** The product's own site; the main way out from its landing page. */
  url: string;
  /** The domain as people should read it ("g1t.sh"). */
  domain: string;
  /** One line: what it is. */
  tagline: string;
  /** A short paragraph: who it's for and why it exists. */
  description: string;
  status: "In development" | "Beta" | "Live";
  /**
   * The product's logo, linked straight from the files its own site publishes,
   * so it follows the product's brand as it changes and is never redrawn here.
   */
  logo: {
    /** For light backgrounds. */
    light: string;
    /** For dark backgrounds, including the product's own card art. */
    dark: string;
    /** The logo file's width / height, so it can be sized before it loads. */
    aspect: number;
  };

  /**
   * The product's card in the products rail, in the product's own colors (not
   * Flagon's), the way a studio shows each game in its own art. The art is
   * fixed: it does not follow the site's light and dark theme.
   */
  card: {
    /** CSS background for the card: the product's art. */
    background: string;
    /** Text color on that background. */
    ink: string;
    /** Accent for small details (status, icons). */
    accent: string;
    surfaces: ProductSurface[];
    /** The product's line drawing (components/art/scenes.tsx). */
    scene: SceneName;
    /** A class that repaints the drawing in the product's palette. */
    artClass: string;
  };

  /** The landing page. Everything below is only shown at /products/<id>. */
  page: {
    /** The one sentence that says why the product exists. */
    pitch: string;
    /** Why we're building it, a few short paragraphs in the company's voice. */
    story: string[];
    /** How it works, as a short sequence. */
    steps: ProductStep[];
    /** What sets it apart. */
    features: ProductFeature[];
    /** How it's priced, plainly. */
    pricing: { summary: string; points: string[] };
    /** A command or two to get going, if there is one. */
    tryIt?: { lead: string; command: string };
    /** Ways into the product, out on its own site. The first is the main one. */
    links: ProductLink[];
  };
};

export const PRODUCTS: Product[] = [
  {
    id: "g1t",
    name: "g1t",
    url: "https://g1t.sh",
    domain: "g1t.sh",
    tagline: "Where your team's code lands.",
    description:
      "A workspace for teams that ship with coding agents. Repositories, pull requests, a merge queue and deployments, with chat and docs for the whole company alongside. Connect Claude Code, Codex or Cursor, and their work lands through the same checks as everyone's.",
    status: "In development",
    logo: {
      light: "https://g1t.sh/brand/g1t-logo.svg",
      dark: "https://g1t.sh/brand/g1t-logo-on-dark.svg",
      aspect: 232.19 / 94.04,
    },
    // g1t's own tokens: near-black, mint for what's live, lavender for art.
    card: {
      background: [
        "radial-gradient(120% 70% at 85% 18%, rgb(182 168 255 / 0.42), transparent 60%)",
        "radial-gradient(90% 60% at 10% 92%, rgb(134 239 196 / 0.32), transparent 62%)",
        "linear-gradient(180deg, #161618, #0f0f11)",
      ].join(", "),
      ink: "#ededef",
      accent: "#86efc4",
      surfaces: ["web", "git", "mcp", "api"],
      scene: "g1t",
      artClass: "art-g1t",
    },
    page: {
      pitch: "Where your team's code lands, whoever wrote it.",
      story: [
        "Coding agents write a real share of the code now, and the tools around them haven't caught up. The code lives in one place, the conversation about it in another, the docs in a third, and the reasoning behind an agent's change is gone the moment its session closes. Five agents can open pull requests in an afternoon, and someone still has to keep main passing.",
        "So we're building one workspace for all of it. Underneath is plain git and a complete forge, so an engineer is at home on day one. Around it are chat for everyone in the company, docs that notice when the code changes under them, and a Home page that tells you each morning what landed, what's live and what needs you. The coding agents you already use connect as you, and their work goes through the same checks and the same merge queue as anyone's.",
        "g1t started as our entry in Cloudflare's competition to build the next git platform. It's in alpha, and we build it on g1t: its own source lives there and lands through its own merge queue.",
      ],
      steps: [
        {
          title: "Ask",
          body: "Open an issue, or raise it in a channel: what should change, and what done looks like.",
        },
        {
          title: "Change",
          body: "You or your coding agent push a branch and open a pull request. The agent's session, what it read, ran and decided, is recorded onto it.",
        },
        {
          title: "Check and review",
          body: "Required checks run on g1t's runners, or free on your own. Every pull request gets a live preview, and a person approves it.",
        },
        {
          title: "Land",
          body: "The merge queue tests each change together with what lands ahead of it. One that breaks goes back to its author, so main only moves to what passed, and production follows main.",
        },
      ],
      features: [
        {
          title: "Start the day on Home",
          body: "What landed, what's live and what still needs you. Notifications settle themselves once a later event resolves them, Start here picks the one to do first, and What changed tells you in plain English what happened while you were away.",
        },
        {
          title: "A forge for many changes at once",
          body: "Repositories, issues, pull requests, reviews, protected branches and code owners, the way your team already works. Conflicts show up on every push, and a merge queue keeps main passing.",
        },
        {
          title: "Many agents, no collisions",
          body: "Connect Claude Code, Codex, Cursor or any MCP client, and it works as you. Each agent claims the issue it takes, its session shows live, and two that start on the same files are told while they work.",
        },
        {
          title: "Every line knows why it's there",
          body: "Pick any line to see its commit, its pull request and issue, and the session the agent recorded as it worked. The reasoning stays with the code, for people and for the next agent.",
        },
        {
          title: "Chat, free for everyone",
          body: "Channels, direct messages and threads, next to the code they're about. Everyone in the company joins for free, with no history cutoff, on the web, the desktop and Android.",
        },
        {
          title: "Docs that keep themselves true",
          body: "Docs edited together live, with history, comments and backlinks. When a merged change touches something a doc cites, its owner is told to update it. Slides, designs and dashboards are next.",
        },
        {
          title: "Every change, live",
          body: "Turn on deployments and every pull request gets its own address on g1t.page, and merging ships production. Bring your own domain. An app nobody visits costs nothing.",
        },
        {
          title: "Safe to hand the work to",
          body: "Scopes, branch rules, guardrails and an audit log hold the same for a person and for the agent working as them. Push protection, dependency upgrades and code scanning are built in.",
        },
        {
          title: "Moving in is an import",
          body: "Bring repositories from GitHub with full history, and keep your Actions workflows by renaming .github to .g1t. Leaving is a git clone, and the core forge runs on your own machine with Docker Compose.",
        },
      ],
      pricing: {
        summary:
          "Chat and the forge are free, with no card. The g1t plan is $21 a month per workspace, and everything g1t runs is priced from what it costs g1t plus 20%. The price book is public, so you can check the math.",
        points: [
          "No seats, ever. A ten-person team pays $21 a month, not $21 a person.",
          "The plan includes $10 of usage each month for checks, workflows, the merge queue and deployments.",
          "Your own runners are free, and so is connecting your coding agents.",
          "Spend limits and alerts from the start, and every price change recorded with its reason.",
        ],
      },
      tryIt: {
        lead: "Make a workspace at g1t.sh, push or import a repository, then connect Claude Code and point it at an issue.",
        command: "claude mcp add --transport http g1t https://mcp.g1t.sh",
      },
      links: [
        { label: "Get started", href: "https://g1t.sh", hint: "g1t.sh" },
        {
          label: "Read the quickstart",
          href: "https://docs.g1t.sh/quickstart/",
          hint: "docs.g1t.sh",
        },
        {
          label: "See every price",
          href: "https://g1t.sh/pricing",
          hint: "g1t.sh/pricing",
        },
        {
          label: "Get the apps",
          href: "https://g1t.sh/download",
          hint: "g1t.sh/download",
        },
        {
          label: "Read the code",
          href: "https://g1t.sh/flagon-io/g1t",
          hint: "Open source, MIT",
        },
      ],
    },
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** The product's page on this site. */
export function productHref(p: Product): string {
  return `/products/${p.id}`;
}
