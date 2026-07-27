/**
 * Central brand + marketing constants for Flagon.
 *
 * Copy, colors, and the launch date live here so the landing page, the
 * document metadata, and anything generated (icons, OG images) stay in sync.
 * Change a headline or a hex once, here, rather than hunting for the string in
 * a dozen JSX files.
 */
export const brand = {
  name: "Flagon",
  /**
   * The contracting entity, for legal documents and the copyright line. Kept
   * separate from `name` on purpose: "Flagon" is the product a customer talks
   * about, "Flagon, Inc." is who takes their money and who a subpoena names.
   */
  legalName: "Flagon, Inc.",
  domain: "flagon.io",
  url: "https://www.flagon.io",
  github: "https://github.com/flagon-io",
  repo: "https://github.com/flagon-io/flagon",

  eyebrow: "The self-hostable developer platform",
  taglineLead: "Stop building your platform.",
  taglineFollow: "Start shipping on it.",
  description:
    "One hub for your projects, environments, and teams, with the products you'd otherwise buy or build stitched right in. One catalog, one login, one bill, everything on the same foundation.",

  /**
   * The public launch. The coming-soon page reads `label` for the eyebrow and
   * `iso` for the countdown, so moving the date is one edit here. `iso` is a
   * fixed instant (not "now + N days") so the countdown is identical on the
   * server and the client and never flashes on hydration.
   */
  launch: {
    label: "Launching July 29, 2026",
    iso: "2026-07-29T16:00:00.000Z",
  },

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
