/**
 * The products Flagon, Inc. builds. Each one is its own thing, with its own
 * site, docs, and brand; this site only introduces them and links out. Adding a
 * product is one object in the PRODUCTS array: the home page, the products page,
 * and the nav all read from here.
 */
export type Product = {
  /** Stable key, also used for anchors (/products#g1t). */
  id: string;
  name: string;
  /** Where the product lives; every product link points here. */
  url: string;
  /** The domain as people should read it ("g1t.sh"). */
  domain: string;
  /** One line: what it is. */
  tagline: string;
  /** A short paragraph: who it's for and why it exists. */
  description: string;
  status: "In development" | "Beta" | "Live";
  /** Optional proof points, a few words each. */
  highlights?: string[];
};

export const PRODUCTS: Product[] = [
  {
    id: "g1t",
    name: "g1t",
    url: "https://g1t.sh",
    domain: "g1t.sh",
    tagline: "Git for AI scale.",
    description:
      "A forge built for thousands of agents working on the same code at once. Issues and pull requests you already know, except any number of agents can take a run at an issue, each in its own fork with a recording of how the change was made, and you merge the one that's right.",
    status: "In development",
    highlights: [
      "Many pull requests per issue",
      "Acceptance checks that gate the merge",
      "Recorded agent sessions",
      "Runs on Cloudflare",
    ],
  },
];

/** The product to put forward first (home page, nav). */
export const FEATURED_PRODUCT = PRODUCTS[0];
