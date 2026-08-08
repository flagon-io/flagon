"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  ArrowUpRight,
  BellRing,
  BookText,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileCog,
  FlaskConical,
  Gauge,
  Globe,
  KeyRound,
  Logs,
  Menu,
  MessagesSquare,
  Network,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Rocket,
  Settings,
  Shield,
  ShieldCheck,
  Signal,
  Siren,
  SlidersHorizontal,
  Split,
  SquareCode,
  Target,
  ToggleRight,
  UserCog,
  Users,
  UsersRound,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { OrgMembership } from "@/lib/org";
import { canManageOrg } from "@/lib/roles";
import { brand } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";
import { OrgSwitcher } from "./org-switcher";
import { WorkspaceSearch } from "./workspace-search";

export const SIDEBAR_COOKIE = "flagon_sidebar";

/**
 * A single navigable row. `href` present + `soon` unset means a real link;
 * `soon` marks a surface we are building toward (rendered disabled).
 */
type NavItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  soon?: boolean;
  /** An off-site link (docs, OpenFeature): opens in a new tab, not a Next route. */
  external?: boolean;
};
type NavGroup = { heading?: string; items: NavItem[] };

/**
 * A drill-in area (Vercel-style): its own landing route and a grouped sub-nav
 * that replaces the root nav while you are anywhere inside it.
 */
type NavArea = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  groups: NavGroup[];
  /** Extra path prefixes that also belong to this area (sub-features routed
   *  outside the area's own href, e.g. Experiments living under Flags). */
  aliases?: string[];
};

/** A root-level row: a plain link, a not-yet-built surface, or a drill-in area. */
type RootEntry =
  | { kind: "link"; label: string; icon: LucideIcon; href: string; external?: boolean }
  | { kind: "soon"; label: string; icon: LucideIcon }
  | { kind: "area"; area: NavArea };

/**
 * The workspace nav, contextualized like Vercel's.
 *
 * At the root you see the org's spaces; clicking a feature (Flags) drills INTO
 * that feature's own grouped navigation, with a back row to return. Deliberately
 * kept apart: Projects is a root space, while Flags and the surfaces under it
 * are GLOBAL to the org (available with your keys across any project), not
 * nested under a project. Settings is likewise its own area with real sub-pages.
 */
function buildNav(base: string, canManage: boolean): {
  sections: RootEntry[][];
  areas: NavArea[];
} {
  const flags: NavArea = {
    key: "flags",
    label: "Flags",
    icon: ToggleRight,
    href: `${base}/flags`,
    // Experiments and their metrics are routed at /experiments but belong to the
    // Flags area, so browsing them keeps this sub-nav in context.
    aliases: [`${base}/experiments`],
    groups: [
      {
        // The flag-tied surfaces (flags, plus the segments and experiments built
        // on them) and Entities, the subjects they evaluate against.
        items: [
          { label: "Flags", icon: ToggleRight, href: `${base}/flags` },
          { label: "Segments", icon: Split, href: `${base}/flags/segments` },
        ],
      },
      {
        heading: "Experiments",
        items: [
          { label: "Experiments", icon: FlaskConical, href: `${base}/experiments` },
          { label: "Metrics", icon: Target, href: `${base}/experiments/metrics` },
          { label: "Holdouts", icon: Shield, href: `${base}/experiments/holdouts` },
        ],
      },
      {
        heading: "Connect",
        items: [
          { label: "Client Keys", icon: KeyRound, href: `${base}/flags/keys` },
          { label: "Archive", icon: Archive, href: `${base}/flags/archive` },
        ],
      },
      {
        heading: "Resources",
        items: [
          {
            label: "Documentation",
            icon: BookText,
            href: `${WEB_URL}/docs/feature-flags`,
            external: true,
          },
          {
            label: "Evaluate with OpenFeature",
            icon: SquareCode,
            href: `${WEB_URL}/docs/feature-flags/evaluate/openfeature`,
            external: true,
          },
          {
            label: "OpenFeature",
            icon: ToggleRight,
            href: "https://openfeature.dev",
            external: true,
          },
        ],
      },
    ],
  };

  // Grouped GitHub-style: a lead General item, then labelled sections. The
  // "Soon" rows are implied longer-tail surfaces (custom roles, audit log, org
  // webhooks) so the shape of the settings area reads complete.
  const settings: NavArea = {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: `${base}/settings`,
    // Integrations lives under /settings/integrations (Developer group below).
    groups: [
      {
        items: [
          { label: "General", icon: SlidersHorizontal, href: `${base}/settings` },
        ],
      },
      {
        heading: "Access",
        items: [
          {
            label: "Member privileges",
            icon: UserCog,
            href: `${base}/settings/member-privileges`,
          },
          { label: "Roles", icon: ShieldCheck, soon: true },
        ],
      },
      {
        heading: "Security",
        items: [
          { label: "Authentication", icon: Shield, href: `${base}/settings/security` },
          { label: "Audit log", icon: Logs, soon: true },
        ],
      },
      {
        heading: "Developer",
        items: [
          { label: "Tokens", icon: KeyRound, href: `${base}/settings/tokens` },
          { label: "Integrations", icon: Plug, href: `${base}/settings/integrations` },
          { label: "Webhooks", icon: Webhook, soon: true },
        ],
      },
      {
        heading: "Billing",
        items: [
          { label: "Billing & plans", icon: CreditCard, href: `${base}/settings/billing` },
        ],
      },
    ],
  };

  // Checks: uptime + synthetic monitoring (Checkly-style). One area for now; the
  // full "Detect / Communicate" split (alert channels, status pages, maintenance
  // windows, dashboards) lands as the product fills out.
  const checks: NavArea = {
    key: "checks",
    label: "Checks",
    icon: Gauge,
    href: `${base}/checks`,
    groups: [
      {
        heading: "Detect",
        items: [
          { label: "Checks", icon: Gauge, href: `${base}/checks` },
        ],
      },
      {
        heading: "Communicate",
        items: [
          { label: "Alert channels", icon: BellRing, href: `${base}/checks/alert-channels` },
          { label: "Maintenance windows", icon: CalendarClock, href: `${base}/checks/maintenance` },
          { label: "Status pages", icon: Signal, href: `${base}/checks/status-pages` },
        ],
      },
      {
        heading: "Resources",
        items: [
          {
            label: "Documentation",
            icon: BookText,
            href: `${WEB_URL}/docs/checks`,
            external: true,
          },
        ],
      },
    ],
  };

  // Reliability: incidents, uptime, and their runbooks. (On-call/escalation is a
  // separate feature set, coming later.)
  const incidents: NavArea = {
    key: "incidents",
    label: "Incidents",
    icon: Siren,
    href: `${base}/incidents`,
    groups: [
      {
        items: [
          { label: "Incidents", icon: Siren, href: `${base}/incidents` },
          { label: "Uptime", icon: Activity, href: `${base}/incidents/uptime` },
          { label: "Runbooks", icon: BookText, href: `${base}/incidents/runbooks` },
        ],
      },
      {
        heading: "Settings",
        items: [
          { label: "Severity levels", icon: Signal, href: `${base}/incidents/settings/severities` },
          { label: "Objectives", icon: Target, href: `${base}/incidents/settings/objectives` },
          { label: "RCCA template", icon: FileCog, href: `${base}/incidents/rcca-template` },
        ],
      },
    ],
  };

  return {
    areas: canManage ? [flags, checks, incidents, settings] : [flags, checks, incidents],
    sections: [
      [
        // Projects is the org home, so its link always works.
        { kind: "link", label: "Projects", icon: Boxes, href: base },
        { kind: "soon", label: "Packages", icon: Package },
        { kind: "soon", label: "Deployments", icon: Rocket },
        { kind: "soon", label: "Logs", icon: Logs },
      ],
      // Functionality: the org-global products. Flags is live; Automations and
      // the Status Page are next. The reliability suite (Incidents + On-call,
      // Better Stack-style but Flagon's own) sits inline here rather than in its
      // own band, so all product surfaces read as one group.
      [
        { kind: "area", area: flags },
        // A first-class feature category (GitHub Actions / Vercel-style): run
        // work on events across every product. Broad enough that it supersedes
        // Runbooks, which is why there is no separate Runbooks entry.
        { kind: "soon", label: "Automations", icon: Workflow },
        { kind: "area", area: checks },
        { kind: "area", area: incidents },
      ],
      // People, GitHub-style: a top-level band everyone can see (the roster +
      // your own paging), NOT buried in the admin-only Settings.
      [
        { kind: "link", label: "Members", icon: Users, href: `${base}/members` },
        { kind: "link", label: "Teams", icon: UsersRound, href: `${base}/teams` },
      ],
      // Administrative / account plumbing, set off from the people rows above.
      [
        { kind: "link", label: "Usage", icon: Activity, href: `${base}/usage` },
        { kind: "link", label: "Community", icon: MessagesSquare, href: brand.discord, external: true },
        // Settings is owner/admin only; members never see it. Integrations lives
        // inside it (Developer group), so there is no separate top-level row.
        ...(canManage
          ? [{ kind: "area" as const, area: settings }]
          : []),
      ],
    ],
  };
}

/** True when the current path is the area's landing, anything beneath it, or
 *  under one of its aliased sub-feature prefixes. */
function inArea(pathname: string, area: NavArea): boolean {
  const prefixes = [area.href, ...(area.aliases ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function WorkspaceSidebar({
  orgs,
  current,
  initialCollapsed,
}: {
  orgs: OrgMembership[];
  current: OrgMembership;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Mobile: the sidebar is an off-canvas drawer (static from `lg` up).
  const [mobileOpen, setMobileOpen] = useState(false);
  // Close the drawer when the route changes (tapping a nav link navigates), via
  // the during-render "adjust state from the previous render" pattern React
  // documents, the same one the view-direction tracking below uses.
  const [drawerRoute, setDrawerRoute] = useState(pathname);
  if (drawerRoute !== pathname) {
    setDrawerRoute(pathname);
    setMobileOpen(false);
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  const base = `/${current.slug}`;
  const { sections, areas } = buildNav(base, canManageOrg(current.role));
  const staticArea = areas.find((a) => inArea(pathname, a));

  // A per-project area is dynamic (keyed on the :project slug in the path), so it
  // is built here rather than in the static buildNav. Overview is real today;
  // the rest are "Soon" placeholders that later phases fill in.
  const projectKey = pathname.startsWith(`${base}/projects/`)
    ? pathname.slice(`${base}/projects/`.length).split("/")[0]
    : null;
  const projectBase = projectKey ? `${base}/projects/${projectKey}` : "";
  const activeArea: NavArea | undefined = projectKey
    ? {
        key: `project:${projectKey}`,
        label: projectKey,
        icon: Boxes,
        href: projectBase,
        groups: [
          {
            items: [
              { label: "Overview", icon: Boxes, href: projectBase },
              { label: "Relationships", icon: Network, href: `${projectBase}/relationships` },
              { label: "Dependencies", icon: Package, soon: true },
            ],
          },
          {
            heading: "Operations",
            items: [
              { label: "Deployments", icon: Rocket, soon: true },
              { label: "Logs", icon: Logs, soon: true },
              { label: "Checks", icon: Gauge, href: `${projectBase}/checks` },
              { label: "Incidents", icon: Siren, href: `${projectBase}/incidents` },
            ],
          },
          {
            heading: "Settings",
            items: [
              { label: "General", icon: SlidersHorizontal, href: `${projectBase}/settings` },
              { label: "Access", icon: Shield, href: `${projectBase}/settings/access` },
              { label: "Domains", icon: Globe, soon: true },
              { label: "Config", icon: FileCog, soon: true },
            ],
          },
        ],
      }
    : staticArea;

  // The nav swaps between the root and a feature's sub-nav in place. Remember the
  // last view (root = depth 0, inside an area = depth 1) so the incoming panel
  // slides in from the correct side: deeper -> from the right, shallower -> from
  // the left. Adjusting state during render is React's documented way to derive
  // from the previous render; the keyed wrapper then replays the animation.
  const viewKey = activeArea?.key ?? "__root__";
  const depth = activeArea ? 1 : 0;
  const [view, setView] = useState({
    key: viewKey,
    depth,
    direction: "forward" as "forward" | "back",
  });
  if (view.key !== viewKey) {
    setView({
      key: viewKey,
      depth,
      direction: depth < view.depth ? "back" : "forward",
    });
  }
  const direction =
    view.key === viewKey
      ? view.direction
      : depth < view.depth
        ? "back"
        : "forward";

  return (
    <>
      {/* Mobile: a fixed trigger in the (otherwise empty) left of the top bar. */}
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
        className="fixed top-2.5 left-3 z-30 grid size-9 place-items-center rounded-md text-zinc-300 hover:bg-white/5 lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 flex-col border-r border-white/8 bg-black transition-[transform,width] lg:static lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-14" : "lg:w-60"}`}
      >
      {/* Org switcher: a header the same height as the top bar, so the sidebar
          and the bar share one continuous top strip. */}
      <div className="flex h-14 shrink-0 items-center border-b border-white/8 px-2">
        <OrgSwitcher orgs={orgs} current={current} collapsed={collapsed} />
      </div>

      <div className="px-2 pt-2">
        <WorkspaceSearch orgs={orgs} current={current} collapsed={collapsed} />
      </div>

      <nav className="flex flex-1 flex-col overflow-hidden">
        {/* Horizontal padding lives on the scroll container (not the nav) so the
            full-bleed `-mx-2` dividers reach exactly its edges instead of
            overflowing it and spawning a horizontal scrollbar. */}
        <div
          key={viewKey}
          className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-2 ${
            direction === "back" ? "nav-in-back" : "nav-in-forward"
          }`}
        >
          {activeArea ? (
            <AreaNav
              area={activeArea}
              base={base}
              pathname={pathname}
              collapsed={collapsed}
            />
          ) : (
            <RootNav
              sections={sections}
              pathname={pathname}
              collapsed={collapsed}
            />
          )}
        </div>
      </nav>

      {/* Footer: collapse toggle, set off by its own top border like the header. */}
      <div className="border-t border-white/8 p-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" />
          )}
          {!collapsed ? <span className="text-sm">Collapse</span> : null}
        </button>
      </div>
      </aside>
    </>
  );
}

/** The root nav: the org's spaces, grouped into divider-separated sections. */
function RootNav({
  sections,
  pathname,
  collapsed,
}: {
  sections: RootEntry[][];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <>
      {sections.map((section, i) => (
        <div key={i}>
          {i > 0 ? <Divider /> : null}
          <ul className="flex flex-col gap-0.5">
            {section.map((entry) =>
              entry.kind === "link" && entry.external ? (
                <NavExternal
                  key={entry.href}
                  href={entry.href}
                  Icon={entry.icon}
                  label={entry.label}
                  collapsed={collapsed}
                />
              ) : entry.kind === "link" ? (
                <NavRow
                  key={entry.href}
                  href={entry.href}
                  Icon={entry.icon}
                  label={entry.label}
                  active={pathname === entry.href}
                  collapsed={collapsed}
                />
              ) : entry.kind === "soon" ? (
                <NavSoon
                  key={entry.label}
                  Icon={entry.icon}
                  label={entry.label}
                  collapsed={collapsed}
                />
              ) : (
                <NavRow
                  key={entry.area.key}
                  href={entry.area.href}
                  Icon={entry.area.icon}
                  label={entry.area.label}
                  active={false}
                  collapsed={collapsed}
                  trailing={
                    !collapsed ? (
                      <ChevronRight className="ml-auto size-4 shrink-0 text-zinc-600" />
                    ) : undefined
                  }
                />
              ),
            )}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The drilled-in nav for one area: a back row, then its grouped sub-nav. */
function AreaNav({
  area,
  base,
  pathname,
  collapsed,
}: {
  area: NavArea;
  base: string;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <>
      <Link
        href={base}
        title={collapsed ? "Back" : undefined}
        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <ChevronLeft className="size-4 shrink-0 text-zinc-500" />
        {!collapsed ? <span className="truncate">{area.label}</span> : null}
      </Link>

      <Divider />

      {area.groups.map((group, i) => (
        <ul key={i} className="flex flex-col gap-0.5 pt-1 first:pt-0">
          {group.heading && !collapsed ? (
            <li className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-600 uppercase">
              {group.heading}
            </li>
          ) : null}
          {group.items.map((item) =>
            item.soon || !item.href ? (
              <NavSoon
                key={item.label}
                Icon={item.icon}
                label={item.label}
                collapsed={collapsed}
              />
            ) : item.external ? (
              <NavExternal
                key={item.href}
                href={item.href}
                Icon={item.icon}
                label={item.label}
                collapsed={collapsed}
              />
            ) : (
              <NavRow
                key={item.href}
                href={item.href}
                Icon={item.icon}
                label={item.label}
                active={pathname === item.href}
                collapsed={collapsed}
              />
            ),
          )}
        </ul>
      ))}
    </>
  );
}

/** A navigable row (link). `trailing` renders after the label (e.g. a chevron). */
function NavRow({
  href,
  Icon,
  label,
  active,
  collapsed,
  trailing,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
  active: boolean;
  collapsed: boolean;
  trailing?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
          active
            ? "bg-white/8 font-medium text-zinc-100"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed ? <span className="truncate">{label}</span> : null}
        {!collapsed ? trailing : null}
      </Link>
    </li>
  );
}

/** An off-site resource link: opens in a new tab, with a subtle out-arrow. */
function NavExternal({
  href,
  Icon,
  label,
  collapsed,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
  collapsed: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={collapsed ? label : undefined}
        className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="truncate">{label}</span>
            <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400" />
          </>
        ) : null}
      </a>
    </li>
  );
}

/** A not-yet-built surface: shown, disabled, with a "Soon" tag. */
function NavSoon({
  Icon,
  label,
  collapsed,
}: {
  Icon: LucideIcon;
  label: string;
  collapsed: boolean;
}) {
  return (
    <li>
      <span
        aria-disabled="true"
        title={`${label} (coming soon)`}
        className={`flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-600 select-none ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="truncate">{label}</span>
            <span className="ml-auto rounded border border-white/10 px-1 py-0.5 text-[9px] font-medium tracking-wide text-zinc-600 uppercase">
              Soon
            </span>
          </>
        ) : null}
      </span>
    </li>
  );
}

/** A full-width divider between sidebar nav groups (spans past the nav padding). */
function Divider() {
  return <div className="-mx-2 my-1 border-t border-white/8" />;
}
