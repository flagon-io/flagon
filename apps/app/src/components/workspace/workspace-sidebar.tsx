"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  BellRing,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Flag,
  FlaskConical,
  Gauge,
  KeyRound,
  LifeBuoy,
  Mail,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Rocket,
  Settings,
  Signal,
  SlidersHorizontal,
  Split,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { OrgMembership } from "@/lib/org";
import { OrgSwitcher } from "./org-switcher";
import { WorkspaceSearch } from "./workspace-search";

export const SIDEBAR_COOKIE = "flagon_sidebar";

/**
 * A single navigable row. `href` present + `soon` unset means a real link;
 * `soon` marks a surface we are building toward (rendered disabled).
 */
type NavItem = { label: string; icon: LucideIcon; href?: string; soon?: boolean };
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
};

/** A root-level row: a plain link, a not-yet-built surface, or a drill-in area. */
type RootEntry =
  | { kind: "link"; label: string; icon: LucideIcon; href: string }
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
function buildNav(base: string): {
  sections: RootEntry[][];
  areas: NavArea[];
} {
  const flags: NavArea = {
    key: "flags",
    label: "Flags",
    icon: Flag,
    href: `${base}/flags`,
    groups: [
      { items: [{ label: "Overview", icon: Gauge, href: `${base}/flags` }] },
      {
        // The flag-tied surfaces (flags, plus the segments and experiments built
        // on them) and Entities, the subjects they evaluate against.
        heading: "Manage",
        items: [
          { label: "Flags", icon: Flag, soon: true },
          { label: "Segments", icon: Split, soon: true },
          { label: "Experiments", icon: FlaskConical, soon: true },
          { label: "Entities", icon: Users, soon: true },
        ],
      },
      {
        heading: "Connect",
        items: [
          { label: "SDK Keys", icon: KeyRound, soon: true },
          { label: "Archive", icon: Archive, soon: true },
        ],
      },
    ],
  };

  const settings: NavArea = {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: `${base}/settings`,
    groups: [
      {
        items: [
          { label: "General", icon: SlidersHorizontal, href: `${base}/settings` },
          { label: "Members", icon: Users, href: `${base}/settings/members` },
          { label: "Invitations", icon: Mail, href: `${base}/settings/invitations` },
          { label: "Tokens", icon: KeyRound, href: `${base}/settings/tokens` },
        ],
      },
    ],
  };

  return {
    areas: [flags, settings],
    sections: [
      [
        { kind: "link", label: "Projects", icon: Boxes, href: base },
        { kind: "soon", label: "Packages", icon: Package },
        { kind: "soon", label: "Deployments", icon: Rocket },
      ],
      [
        { kind: "area", area: flags },
        { kind: "soon", label: "Teams", icon: Users },
        { kind: "soon", label: "Integrations", icon: Plug },
      ],
      // Reliability suite (Better Stack-style, but Flagon's own product): status
      // pages, on-call/incidents, and runbook automation. Flagon-native labels,
      // not the third-party tools these riff on.
      [
        { kind: "soon", label: "Status Page", icon: Signal },
        { kind: "soon", label: "On-call", icon: BellRing },
        { kind: "soon", label: "Runbooks", icon: Terminal },
      ],
      [
        { kind: "soon", label: "Usage", icon: Activity },
        { kind: "soon", label: "Support", icon: LifeBuoy },
        { kind: "area", area: settings },
      ],
    ],
  };
}

/** True when the current path is the area's landing or anything beneath it. */
function inArea(pathname: string, area: NavArea): boolean {
  return pathname === area.href || pathname.startsWith(`${area.href}/`);
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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  const base = `/${current.slug}`;
  const { sections, areas } = buildNav(base);
  const activeArea = areas.find((a) => inArea(pathname, a));

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
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-white/8 bg-black transition-[width] ${
        collapsed ? "w-14" : "w-60"
      }`}
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
          className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-2 py-2 ${
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
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" />
          )}
          {!collapsed ? <span className="text-sm">Collapse</span> : null}
        </button>
      </div>
    </aside>
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
              entry.kind === "link" ? (
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
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-zinc-600" />
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
        <ChevronLeft className="h-4 w-4 shrink-0 text-zinc-500" />
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
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed ? <span className="truncate">{label}</span> : null}
        {!collapsed ? trailing : null}
      </Link>
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
        title={`${label} — coming soon`}
        className={`flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-600 select-none ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
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
