/**
 * Central brand + marketing constants for Flagon.
 * Keep copy and colors here so the landing page, metadata, and generated
 * OG/social images stay in sync.
 */
export const brand = {
  name: "Flagon",
  domain: "flagon.io",
  url: "https://www.flagon.io",
  apiUrl: "https://api.flagon.io",
  github: "https://github.com/flagon-io",

  eyebrow: "The open-source developer platform",
  taglineLead: "Stop building your platform.",
  taglineFollow: "Start shipping on it.",
  description:
    "One hub for your projects, environments, and teams, with the products you'd otherwise buy or build stitched right in. One catalog, one login, one bill, everything sharing the same foundation.",

  nav: ["Products", "Enterprise", "Pricing", "Docs"] as const,

  products: [
    "Catalog",
    "Feature Flags",
    "Experiments",
    "Config",
  ] as const,

  colors: {
    bg: "#09090b",
    surface: "#0b0f10",
    text: "#fafafa",
    muted: "#a1a1aa",
    accent: "#14b8a6",
    accentBright: "#2dd4bf",
    accentDeep: "#0d9488",
  },
} as const;
