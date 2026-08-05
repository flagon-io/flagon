/**
 * The marketing header's top-level sections, shared by the desktop nav
 * (site-header) and the mobile menu (mobile-nav) so the two never drift.
 * Items without an `href` render as inert, clearly-disabled labels so the
 * nav's final shape is visible before those pages exist.
 */
export const NAV_ITEMS: readonly {
  label: string;
  href?: string;
  external?: boolean;
  /** Render inert with a "Soon" badge (a surface we are building toward). */
  soon?: boolean;
}[] = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

/**
 * Whether a nav item is the section the visitor is currently in. A section owns
 * its subtree, so `/docs/catalog` lights up "Docs"; the home page ("/") owns
 * only itself and never matches a section link.
 */
export function isActivePath(pathname: string, href?: string): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
