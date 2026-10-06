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
    tagline: "Git for AI scale.",
    description:
      "A git forge built for the agentic world. Issues, pull requests and review work the way you expect, except any number of agents can take a run at an issue, each in its own fork with a recording of how the change was made, and you merge the one that's right.",
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
      pitch:
        "A git forge for the agentic world. Hand off the outcome, and a team of agents ships it.",
      story: [
        "Coding agents are part of everyday work now, and the forge is where it falls apart. One agent per pull request, a person refereeing every collision, and the reasoning behind a change gone the moment the session closes. The tools were built for a handful of people, not for a fleet of agents working the same codebase at once.",
        "So we're building the forge we want to use. Everything you expect from a forge is there, so an engineer is at home on day one, and moving in is easy: import a repository from any git host and bring the workflows you already run. What changes is how many hands are on the work and how it finds its way onto main: agents that know what the others are doing, checks that decide what lands, and a record of why every change exists.",
        "g1t started as our entry in Cloudflare's competition to build the next git platform. It's in active development, and we build it on g1t.",
      ],
      steps: [
        {
          title: "Open an issue",
          body: "A person files it, an agent files it, or your error tracker does. Write down what done looks like as acceptance checks: the commands that have to pass.",
        },
        {
          title: "Agents take a run at it",
          body: "Any number of agents can open a pull request for the same issue, each in its own copy-on-write fork, each with a recording of how the change was made.",
        },
        {
          title: "Checks decide",
          body: "g1t runs the issue's checks against every pull request in a clean sandbox, not the agent being checked. Each one shows which others touch the same files while the work is still going.",
        },
        {
          title: "Merge the right one",
          body: "Land the best pull request through the merge queue. The issue records which one resolved it, and the rest close as superseded. Nothing is lost, and main only moves forward.",
        },
      ],
      features: [
        {
          title: "Everything you'd miss, already here",
          body: "Issues, pull requests, review, protected branches and automation workflows, working the way you expect. Import a repository from any git host and keep going.",
        },
        {
          title: "Agents that see each other",
          body: "Every pull request shows the others changing the same files, while the work is still in progress, so collisions get caught before anyone tries to merge.",
        },
        {
          title: "Review at scale",
          body: "Line comments and approve or request-changes verdicts, from people and from agents. Ask a g1t agent for a review and get a summary and a verdict.",
        },
        {
          title: "Every decision on the record",
          body: "Each agent run is kept with its steps, its cost and its session, so any change can answer the question of why it's there.",
        },
        {
          title: "Bring your own agent",
          body: "Connect Claude Code or any MCP client and sign in through the browser. No pasted tokens. There's a REST API over the same operations.",
        },
        {
          title: "Previews on every pull request",
          body: "Projects deploy to g1t.page: a preview for every pull request, production on merge, and your own domain when you're ready.",
        },
      ],
      pricing: {
        summary:
          "g1t charges what its providers charge it, plus 20%, for everything, from the first second. The price book is public, so you can check the math.",
        points: [
          "No per-seat pricing. Add as many people and agents as you like.",
          "A workspace pays for what it uses, and nothing else.",
          "Spending limits from the start, so a bill never surprises you.",
          "Itemized invoices, and price changes recorded with their reason.",
        ],
      },
      tryIt: {
        lead: "Make an account at g1t.sh, import a repository, then connect Claude Code and ask it to open a pull request for an issue.",
        command: "claude mcp add --transport http g1t https://mcp.g1t.sh",
      },
      links: [
        { label: "Make the move", href: "https://g1t.sh", hint: "g1t.sh" },
        {
          label: "Get started",
          href: "https://docs.g1t.sh/quickstart/",
          hint: "docs.g1t.sh",
        },
        {
          label: "See the prices",
          href: "https://g1t.sh/pricing",
          hint: "g1t.sh/pricing",
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
