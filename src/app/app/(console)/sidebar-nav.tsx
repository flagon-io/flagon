"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CreditCard,
  Flag,
  Home,
  Package,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/** The app lives at /app/... locally but at the subdomain root in production;
 * normalize both sides so active states match either way. */
export function normalizeAppPath(path: string): string {
  return path.replace(/^\/app(?=\/|$)/, "") || "/";
}

/** First path segment of the current app URL, if it names one of the user's
 * organizations. Falls back to the session's active org so the sidebar stays
 * org-scoped on non-org pages (settings, create flow). */
export function currentOrgSlug(
  pathname: string,
  orgSlugs: readonly string[],
  fallbackSlug: string | null,
): string | null {
  const segment = normalizeAppPath(pathname).split("/")[1] ?? "";
  return orgSlugs.includes(segment) ? segment : fallbackSlug;
}

type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Org-relative path ("" = overview, "flags" = /app/<org>/flags). Items
   * without a path haven't shipped yet and render as disabled placeholders. */
  path?: string;
  exact?: boolean;
};

type NavSection = {
  heading?: string;
  items: NavItem[];
};

/**
 * The console map, ordered by frequency of use. The backbone is daily work:
 * Overview and Projects, with org-level product surfaces joining "Products"
 * as they ship (project-scoped surfaces live inside each project's own
 * pages, never here). "People" is who's here (Members) and how they group
 * (Teams); "Organization" is the administrative cluster - usage, money,
 * configuration. Give an item a `path` when its surface lands and it goes
 * live in the nav.
 */
const SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview", icon: Home, path: "", exact: true },
      { label: "Projects", icon: Package, path: "projects" },
    ],
  },
  {
    heading: "Products",
    items: [{ label: "Feature Flags", icon: Flag }],
  },
  {
    heading: "People",
    items: [
      { label: "Members", icon: UserRound, path: "members" },
      { label: "Teams", icon: Users, path: "teams" },
    ],
  },
  {
    heading: "Organization",
    items: [
      { label: "Usage", icon: Activity },
      { label: "Billing", icon: CreditCard },
      { label: "Settings", icon: Settings },
    ],
  },
];

const itemBase =
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition";
const itemIdle = "text-zinc-400 hover:bg-white/5 hover:text-zinc-100";
const itemActive = "bg-white/5 text-zinc-100";
const itemSoon = "cursor-default text-zinc-600";

function Item({
  item,
  orgSlug,
  pathname,
}: {
  item: NavItem;
  orgSlug: string | null;
  pathname: string;
}) {
  const Icon = item.icon;
  const live = item.path !== undefined && orgSlug !== null;

  if (!live) {
    return (
      <span
        className={`${itemBase} ${itemSoon}`}
        aria-disabled
        title="Coming soon"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {item.label}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-700">
          Soon
        </span>
      </span>
    );
  }

  const href = item.path ? `/app/${orgSlug}/${item.path}` : `/app/${orgSlug}`;
  const target = normalizeAppPath(href);
  const active = item.exact
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${itemBase} ${active ? itemActive : itemIdle}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${active ? "text-zinc-100" : "text-zinc-500"}`}
        aria-hidden
      />
      {item.label}
    </Link>
  );
}

/**
 * App sidebar navigation, org-scoped and grouped into sections. Surfaces
 * that haven't shipped render as disabled placeholders so the console
 * always shows the shape of the whole platform.
 */
export function SidebarNav({
  orgSlugs,
  fallbackSlug,
}: {
  orgSlugs: string[];
  fallbackSlug: string | null;
}) {
  const rawPathname = usePathname();
  const pathname = normalizeAppPath(rawPathname);
  const orgSlug = currentOrgSlug(rawPathname, orgSlugs, fallbackSlug);

  return (
    <nav
      aria-label="Console"
      className="flex flex-1 flex-col overflow-y-auto px-3 py-3"
    >
      {SECTIONS.map((section, index) => (
        <div key={section.heading ?? index} className={index ? "mt-5" : ""}>
          {section.heading ? (
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
              {section.heading}
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <Item
                key={item.label}
                item={item}
                orgSlug={orgSlug}
                pathname={pathname}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
