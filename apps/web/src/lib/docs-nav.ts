/**
 * The docs sidebar, in order. A section is a labelled block; its items are
 * either a single page (a leaf) or a collapsible group of pages.
 *
 * Three shapes:
 *   - Leaf:   `{ title, href }`                  a single page.
 *   - Group:  `{ title, items: [...leaves] }`    a collapsible section; renders
 *             a chevron and expands to its child pages. Auto-opens on the page
 *             you're viewing.
 *   - Soon:   add `soon: true` to a leaf or group for something not documented
 *             yet (a product or tool we haven't built out). It shows as a muted
 *             row with a "Soon" badge and is not a link. A soon group can still
 *             list its planned pages, also soon.
 *
 * Adding a real page: create `src/app/docs/<slug>/page.mdx`, then add a leaf
 * here. The nav drives the sidebar, the sitemap, and prev/next paging (soon
 * items are skipped, and a page listed in two places is paged/indexed once).
 * Every href is under `/docs`.
 */
export type NavLeaf = { title: string; href?: string; soon?: boolean };
export type NavGroup = { title: string; items: NavLeaf[]; soon?: boolean };
export type NavNode = NavLeaf | NavGroup;
export type NavSection = { title: string; items: NavNode[] };

/** A group has child items; a leaf does not. */
export function isGroup(node: NavNode): node is NavGroup {
  return "items" in node;
}

export const nav: NavSection[] = [
  {
    title: "Get started",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Quickstart", href: "/docs/quickstart" },
      {
        title: "Guides",
        items: [
          {
            title: "From a flag to an experiment",
            href: "/docs/guides/flag-to-experiment",
          },
        ],
      },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "What is Flagon", href: "/docs/platform" },
      { title: "Usage & billing", href: "/docs/platform/billing" },
      {
        title: "Architecture",
        items: [
          { title: "Overview", href: "/docs/platform/architecture" },
          { title: "Data model", soon: true },
        ],
      },
      {
        title: "Core concepts",
        items: [
          { title: "Organizations & teams", href: "/docs/platform/organizations" },
          { title: "Projects", href: "/docs/platform/projects" },
          { title: "Teams", href: "/docs/platform/teams" },
          { title: "Environments", href: "/docs/platform/environments" },
        ],
      },
      {
        title: "Security",
        items: [
          { title: "Authentication & tokens", href: "/docs/platform/authentication" },
          { title: "Permissions & roles", href: "/docs/platform/security/permissions" },
          { title: "Tenant isolation", href: "/docs/platform/security/isolation" },
        ],
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "API",
        items: [
          { title: "Overview", href: "/docs/platform/api" },
          { title: "Rate limits", href: "/docs/platform/api/rate-limits" },
          { title: "Errors", href: "/docs/platform/api/errors" },
        ],
      },
      { title: "CLI", soon: true },
      { title: "MCP server", soon: true },
      { title: "flagon.yml", soon: true },
    ],
  },
  {
    title: "Products",
    items: [
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
          { title: "Client keys", href: "/docs/feature-flags/client-keys" },
          { title: "Evaluate with OpenFeature", href: "/docs/feature-flags/evaluate/openfeature" },
          { title: "Evaluate with REST", href: "/docs/feature-flags/evaluate/rest" },
          { title: "Record exposures", href: "/docs/feature-flags/exposures" },
          { title: "Management API", href: "/docs/feature-flags/management-api" },
          { title: "Troubleshooting", href: "/docs/feature-flags/troubleshooting" },
        ],
      },
      {
        title: "Experiments",
        items: [
          { title: "Overview", href: "/docs/experiments" },
          { title: "Record goal events", href: "/docs/experiments/track" },
          { title: "How results work", href: "/docs/experiments/statistics" },
          { title: "Holdouts", href: "/docs/experiments/holdouts" },
        ],
      },
      { title: "Deployments", soon: true },
      { title: "Packages", soon: true },
      { title: "Automations", soon: true },
      { title: "Incidents & on-call", soon: true },
    ],
  },
  {
    title: "Self-host",
    items: [{ title: "Run Flagon", href: "/docs/self-hosting" }],
  },
  {
    title: "Help",
    items: [{ title: "Getting help", href: "/docs/help" }],
  },
  // The full generated endpoint list stands alone at the very bottom, so it's
  // always easy to find no matter which product you're reading about.
  {
    title: "API Reference",
    items: [{ title: "REST API", href: "/docs/api-reference" }],
  },
];

/**
 * Flattened real pages, in sidebar order, deduplicated by href — for prev/next
 * paging and the sitemap. Soon items (no href) are skipped, and a page listed
 * in two sections (e.g. Quickstart) is kept once, at its first appearance.
 */
export type FlatNavItem = { title: string; href: string };
export const flatNav: FlatNavItem[] = (() => {
  const seen = new Set<string>();
  const out: FlatNavItem[] = [];
  for (const section of nav) {
    for (const node of section.items) {
      const leaves = isGroup(node) ? node.items : [node];
      for (const leaf of leaves) {
        if (leaf.soon || !leaf.href || seen.has(leaf.href)) continue;
        seen.add(leaf.href);
        out.push({ title: leaf.title, href: leaf.href });
      }
    }
  }
  return out;
})();
