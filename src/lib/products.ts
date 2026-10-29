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
  /** Where it goes, as people should read it ("docs.example.dev"). */
  hint: string;
};

/** Where a product can be used, shown as small icons on its card. */
export type ProductSurface = "web" | "git" | "mcp" | "api";

export type ProductStep = { title: string; body: string };
export type ProductFeature = { title: string; body: string };
export type ProductSectionHeader = { title: string; lead: string };

export type Product = {
  /** Stable key, used for the landing page URL (/products/<id>). */
  id: string;
  name: string;
  /** The product's own site; the main way out from its landing page. */
  url: string;
  /** The domain as people should read it ("example.dev"). */
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

/**
 * Empty while the first product is in the workshop. Every page that lists
 * products handles an empty list: the rail shows what's brewing, and the nav
 * and footer point at /products instead.
 */
export const PRODUCTS: Product[] = [];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** The product's page on this site. */
export function productHref(p: Product): string {
  return `/products/${p.id}`;
}
