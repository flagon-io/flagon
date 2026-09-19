import {
  LayoutDashboard,
  Boxes,
  Settings2,
  SlidersHorizontal,
  Users,
  KeyRound,
  Gauge,
  CreditCard,
  CircleUserRound,
  ShieldCheck,
  ScrollText,
  UserCog,
  UsersRound,
  Webhook,
  KeySquare,
  Fingerprint,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string;
  /** Match the pathname exactly (for an index route) instead of by prefix. */
  exact?: boolean;
  /** Has a contextual sub-nav; the item shows a chevron and drills in. */
  section?: boolean;
  /** Placeholder for a not-yet-shipped area: rendered greyed with a "Soon" tag,
   * not a link, and excluded from breadcrumbs and the command menu. */
  disabled?: boolean;
};

/**
 * The org-scoped main nav: flat groups separated by dividers (no section
 * labels). Items marked `section` open a contextual sub-nav (see orgSection).
 */
export function orgNav(slug: string): NavLink[][] {
  const base = `/${slug}`;
  return [
    [
      { label: "Dashboard", href: base, icon: LayoutDashboard, exact: true },
      { label: "Projects", href: `${base}/projects`, icon: Boxes },
    ],
    [
      { label: "Usage", href: `${base}/usage`, icon: Gauge },
      { label: "Settings", href: `${base}/settings`, icon: Settings2, section: true },
    ],
  ];
}

/** A labelled cluster of sub-nav links (GitHub-style grouped settings). A group
 * with no label renders its items with no header (the top "General" cluster). */
export type NavGroup = { label?: string; items: NavLink[] };

export type OrgSection = { title: string; backHref: string; groups: NavGroup[]; items: NavLink[] };

/** The org Settings sub-nav, grouped like GitHub. `settingsItems` flattens it for
 * the command menu and breadcrumbs so the sources never drift. */
export function settingsGroups(slug: string): NavGroup[] {
  const base = `/${slug}`;
  return [
    { items: [{ label: "General", href: `${base}/settings`, icon: SlidersHorizontal, exact: true }] },
    {
      label: "Access",
      items: [
        { label: "Members", href: `${base}/settings/members`, icon: Users },
        { label: "Teams", href: `${base}/settings/teams`, icon: UsersRound, disabled: true },
        { label: "Roles", href: `${base}/settings/roles`, icon: UserCog, disabled: true },
        {
          label: "Member privileges",
          href: `${base}/settings/member-privileges`,
          icon: ShieldCheck,
        },
      ],
    },
    {
      label: "Billing and plans",
      items: [{ label: "Billing", href: `${base}/settings/billing`, icon: CreditCard }],
    },
    {
      label: "Developer",
      items: [
        { label: "API tokens", href: `${base}/settings/tokens`, icon: KeyRound },
        { label: "Webhooks", href: `${base}/settings/webhooks`, icon: Webhook, disabled: true },
        { label: "Secrets", href: `${base}/settings/secrets`, icon: KeySquare, disabled: true },
      ],
    },
    {
      label: "Security",
      items: [
        {
          label: "Authentication",
          href: `${base}/settings/authentication`,
          icon: Fingerprint,
        },
      ],
    },
    {
      label: "Logs",
      items: [{ label: "Audit log", href: `${base}/settings/audit`, icon: ScrollText }],
    },
  ];
}

/** Flat list of the settings links (command menu, breadcrumbs). */
export function settingsItems(slug: string): NavLink[] {
  return settingsGroups(slug).flatMap((g) => g.items);
}

/** The contextual sub-nav shown when inside a section (currently Settings). */
export function orgSection(slug: string, pathname: string): OrgSection | null {
  const base = `/${slug}`;
  const inSettings =
    pathname === `${base}/settings` || pathname.startsWith(`${base}/settings/`);
  if (!inSettings) return null;

  return {
    title: "Settings",
    backHref: base,
    groups: settingsGroups(slug),
    items: settingsItems(slug),
  };
}

const matches = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export { matches };

/**
 * The breadcrumb trail AFTER the org root, deepest last. E.g.
 *   /<org>/settings/billing -> [{Settings, /settings}, {Billing, /settings/billing}]
 *   /<org>/projects          -> [{Projects, /projects}]
 *   /<org>                   -> []
 * The org itself is rendered separately (the leading crumb).
 */
export function breadcrumbTrail(slug: string, pathname: string): { label: string; href: string }[] {
  const base = `/${slug}`;
  const section = orgSection(slug, pathname);

  if (section) {
    const crumbs = [{ label: section.title, href: `${base}/settings` }];
    // Deepest section item that isn't the section root (General shares its href).
    let leaf: NavLink | null = null;
    for (const it of section.items) {
      if (matches(pathname, it.href, it.exact) && it.href !== `${base}/settings`) {
        if (!leaf || it.href.length > leaf.href.length) leaf = it;
      }
    }
    if (leaf) crumbs.push({ label: leaf.label, href: leaf.href });
    return crumbs;
  }

  const item = activeItem(slug, pathname);
  return item && item.href !== base ? [item] : [];
}

/** The deepest matching link (main nav or the active section), for breadcrumbs. */
export function activeItem(slug: string, pathname: string): { label: string; href: string } | null {
  const links: NavLink[] = orgNav(slug).flat();
  const section = orgSection(slug, pathname);
  if (section) links.push(...section.items);

  let match: { label: string; href: string } | null = null;
  for (const l of links) {
    if (matches(pathname, l.href, l.exact) && (!match || l.href.length > match.href.length)) {
      match = { label: l.label, href: l.href };
    }
  }
  return match;
}

export type CommandItem = {
  group: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string;
  /** Extra terms to match on beyond the label (synonyms, abbreviations). */
  keywords?: string;
};

/**
 * Every destination the quick-search can jump to, grouped for display. Built from
 * the same nav sources so it stays in sync. Personal account routes live outside
 * the org (the one non-org exception), so they're always reachable here too.
 */
export function commandItems(slug: string): CommandItem[] {
  const base = `/${slug}`;
  // Drop section parents (e.g. "Settings"): their children are listed directly
  // below, so including the parent would duplicate its destination.
  const nav = orgNav(slug)
    .flat()
    .filter((l) => !l.section);
  const keywords: Record<string, string> = {
    [base]: "home overview start",
    [`${base}/projects`]: "apps services repos",
    [`${base}/usage`]: "billing metering consumption credits plan",
  };

  return [
    ...nav.map((l) => ({
      group: "Navigation",
      label: l.label,
      href: l.href,
      icon: l.icon,
      keywords: keywords[l.href],
    })),
    ...settingsItems(slug)
      .filter((l) => !l.disabled)
      .map((l) => ({
      group: "Settings",
      label: l.label,
      href: l.href,
      icon: l.icon,
      badge: l.badge,
      keywords:
        l.label === "API tokens"
          ? "pat personal access token"
          : l.label === "Members"
            ? "team people invite roles"
            : l.label === "Billing"
              ? "plan payment card credit invoice upgrade"
              : l.label === "Audit log"
                ? "audit history events changes who did what security"
                : "org organization preferences",
    })),
    { group: "Account", label: "Account settings", href: "/settings", icon: CircleUserRound, keywords: "personal profile me" },
    { group: "Account", label: "Security", href: "/settings/security", icon: ShieldCheck, keywords: "2fa password passkeys sessions" },
  ];
}
