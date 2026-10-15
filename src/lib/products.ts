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
export type ProductSectionHeader = { title: string; lead: string };

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
    /** How it works, as a short sequence of up to four steps. */
    stepsHeader: ProductSectionHeader;
    steps: ProductStep[];
    /** What sets it apart, in rows of three. */
    featuresHeader: ProductSectionHeader;
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
    tagline: "Where your team and its coding agents ship code.",
    description:
      "Start each day on Home: what landed, what is live, and what needs you next. Behind it, repositories, pull requests, required checks, a merge queue and deployments, with chat and docs for your team. Connect the coding agents you already use, and their work lands through the same checks as everyone's.",
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
        "Agents do the work. You make the calls. Your coding agents push the branches and open the pull requests, and their work lands through the same checks as everyone's. You decide what they take on and what ships.",
        "Underneath is plain git. Every change, whether you wrote it or your coding agent did, is a pull request: checked, reviewed, and landed through a queue that keeps main passing. Around it, Home, Code, Chat and Artifacts share one set of members, one sign-in and one bill.",
        "g1t started as our entry in Cloudflare's competition to build the next git platform. It's MIT licensed, its own source lives on g1t, and its changes land through its own merge queue.",
      ],
      stepsHeader: {
        title: "From an issue to main",
        lead: "Rules decide what lands, not whoever wrote it.",
      },
      steps: [
        {
          title: "Ask",
          body: "Open an issue, or raise it in a channel: what should change, and what done looks like.",
        },
        {
          title: "Change",
          body: "You or your coding agent push a branch and open a pull request. The agent's session is recorded onto it.",
        },
        {
          title: "Check and review",
          body: "Required checks run on g1t's runners or your own, and the pull request gets a live preview. A person reviews and approves. Rules and protected branches apply to everyone.",
        },
        {
          title: "Main",
          body: "The queue tests each change with what lands before it. Production follows main.",
        },
      ],
      featuresHeader: {
        title: "One workspace",
        lead: "Talk, write it down, ship.",
      },
      features: [
        {
          title: "Start every day knowing where things stand",
          body: "Home is your daily update and your way into the forge. It clears what resolved itself, tells you in plain English what changed and what is live, and takes you straight to what is yours to decide: a merge, a review, a fix.",
        },
        {
          title: "A forge built for many changes at once",
          body: "Issues, branches, pull requests and reviews, the way your team already works. Write a change by hand, have your coding agent write it, or both on the same branch.",
        },
        {
          title: "Main only moves to what passed",
          body: "Required checks run on g1t's runners, or free on your own. The queue tests each change together with what lands ahead of it, and one that breaks goes back to its author with what failed.",
        },
        {
          title: "Every line knows why it is there",
          body: "Pick any line. g1t shows the commit that changed it, the pull request and issue it came from, and the session your coding agent recorded as it worked: what it read, ran and decided.",
        },
        {
          title: "Bring your own agent",
          body: "Any agent that speaks MCP works on g1t. Connect Claude Code, Codex, Cursor or any other MCP client and sign in once. It works as you, with only the access you give it.",
        },
        {
          title: "Many agents, no collisions",
          body: "Each agent claims the issue it takes, and every session shows live as it works. Two that start changing the same files are told while they work, before either opens a pull request.",
        },
        {
          title: "Every change, live on the edge",
          body: "Every pull request gets its own address on g1t.page, and merging ships production. Reviewers click through a change instead of reading a diff. An app nobody visits costs nothing.",
        },
        {
          title: "Just talk to your team",
          body: "Channels, direct messages and threads, next to the code they're about. Messages arrive the moment they are sent, and everyone in the company can join for free.",
        },
        {
          title: "A knowledge base that keeps itself true",
          body: "Docs edited together live, with history, comments and backlinks. When a merged change touches something a doc cites, the doc is flagged for its owner to update.",
        },
        {
          title: "The same rails for people and agents",
          body: "Scopes, rules, guardrails and audit are set by the workspace and enforced by g1t. They hold the same for a person at a keyboard and for the coding agent working as them.",
        },
        {
          title: "Secure by default",
          body: "A push that adds a key or a token is refused before it lands. Vulnerable dependencies become upgrades, code scanning can block a merge, and every pull request gets dependency review.",
        },
        {
          title: "Moving in is an import. Leaving is a git clone.",
          body: "Bring repositories across from GitHub with every branch and tag and full history. GitHub Actions workflows keep working: rename .github to .g1t and push.",
        },
      ],
      pricing: {
        summary: "People chat free. Pay for what runs. Never per seat.",
        points: [
          "$0 to chat. Channels, DMs, threads and the forge are included on every plan, free too, with no history cutoff.",
          "The g1t plan is $21 a month per workspace, with $10 of usage included and unlimited members.",
          "Checks, workflows, deployments and storage are priced from what they cost g1t plus 20%.",
          "Time on your own runners costs nothing, and connecting your coding agents is free.",
        ],
      },
      tryIt: {
        lead: "Anyone can sign up. Create a workspace in a minute, push a repository and connect the coding agent you already use. Add g1t as a remote MCP server, then sign in through your browser:",
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
          label: "Download",
          href: "https://g1t.sh/download",
          hint: "g1t.sh/download",
        },
        {
          label: "Browse the source",
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
