/**
 * The docs sidebar, in order. Grouped by area: the platform fundamentals that
 * apply everywhere, then each product, then self-hosting. Adding a page is:
 * create `src/app/docs/<slug>/page.mdx`, then add an entry here (it also drives
 * the sitemap and prev/next paging). Every href is under `/docs`.
 */
export type NavItem = { title: string; href: string };
export type NavSection = { title: string; items: NavItem[] };

export const nav: NavSection[] = [
  {
    title: "Platform",
    items: [
      { title: "What is Flagon", href: "/docs/platform" },
      { title: "Organizations & teams", href: "/docs/platform/organizations" },
      { title: "Projects", href: "/docs/platform/projects" },
      { title: "Environments", href: "/docs/platform/environments" },
      { title: "Authentication & tokens", href: "/docs/platform/authentication" },
      { title: "The Flagon API", href: "/docs/platform/api" },
    ],
  },
  {
    title: "Catalog",
    items: [{ title: "Overview", href: "/docs/catalog" }],
  },
  {
    title: "Feature Flags",
    items: [
      { title: "Overview", href: "/docs/feature-flags" },
      { title: "Quickstart", href: "/docs/feature-flags/quickstart" },
      { title: "Flags & variants", href: "/docs/feature-flags/flags" },
      { title: "Targeting & segments", href: "/docs/feature-flags/targeting" },
      { title: "SDK keys", href: "/docs/feature-flags/sdk-keys" },
      { title: "Evaluate with OpenFeature", href: "/docs/feature-flags/evaluate/openfeature" },
      { title: "Evaluate with REST", href: "/docs/feature-flags/evaluate/rest" },
      { title: "Management API", href: "/docs/feature-flags/management-api" },
      { title: "Troubleshooting", href: "/docs/feature-flags/troubleshooting" },
    ],
  },
  {
    title: "Self-host",
    items: [{ title: "Run Flagon", href: "/docs/self-hosting" }],
  },
  {
    title: "API Reference",
    items: [{ title: "REST API", href: "/docs/api-reference" }],
  },
];

/** Flattened, in sidebar order — for prev/next paging. */
export const flatNav: NavItem[] = nav.flatMap((s) => s.items);
