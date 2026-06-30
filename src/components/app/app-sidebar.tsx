'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  Flag,
  Home,
  Inbox,
  KeyRound,
  Layers,
  type LucideIcon,
  PanelLeft,
  PanelLeftClose,
  Palette,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/logo';
import { OrgSwitcher, type Org } from '@/components/org-switcher';
import { cn } from '@/lib/cn';

/** Icon registry — keeps NavSection serializable (icon is a string key). */
const ICONS = {
  home: Home,
  projects: Boxes,
  flag: Flag,
  segment: Layers,
  environments: Layers,
  keys: KeyRound,
  users: Users,
  settings: Settings,
  sudo: ShieldCheck,
  inbox: Inbox,
  palette: Palette,
  back: ArrowLeft,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

export type NavItem = {
  label: string;
  icon: NavIcon;
  href?: string;
  /** Render as a disabled "Soon" item (no link). */
  soon?: boolean;
  /** External link (full navigation, e.g. another subdomain). */
  external?: boolean;
  /** Active only on exact path match (use for section roots like Overview). */
  end?: boolean;
};
export type NavSection = { title?: string; items: NavItem[] };
export type NavFooterItem = { label: string; href: string; icon: NavIcon; external?: boolean };

const STORAGE_KEY = 'flagon:sidebar-collapsed';
const ROW = 'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors';

export type SidebarHeaderProps = {
  /** When provided, the header renders the org switcher. */
  orgs?: Org[];
  activeSlug?: string;
  /** When `orgs` is absent, the header renders a brand mark linking here. */
  brandHref?: string;
  badge?: string;
};

/** Header cell content: org switcher, or a brand mark for the sudo console.
 *  Shared by the desktop sidebar and the mobile drawer. */
export function SidebarHeaderContent({
  orgs,
  activeSlug,
  brandHref,
  badge,
  collapsed = false,
}: SidebarHeaderProps & { collapsed?: boolean }) {
  if (orgs) {
    return (
      <div className="w-full">
        <OrgSwitcher orgs={orgs} activeSlug={activeSlug} collapsed={collapsed} />
      </div>
    );
  }
  return (
    <Link href={brandHref ?? '#'} className="flex items-center gap-2" title={collapsed ? 'Flagon' : undefined}>
      {collapsed ? <LogoMark size={24} /> : <Logo />}
      {!collapsed && badge && (
        <span className="rounded border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-brand-500">
          {badge}
        </span>
      )}
    </Link>
  );
}

/** Grouped nav sections with active-route highlighting. Shared by the desktop
 *  sidebar and the mobile drawer. */
export function SidebarNav({ sections, collapsed = false }: { sections: NavSection[]; collapsed?: boolean }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => {
    if (!item.href) return false;
    if (item.end) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-4">
      {sections.map((section, i) => (
        <div key={section.title ?? `s${i}`} className={i > 0 ? 'mt-6' : undefined}>
          {section.title &&
            (collapsed ? (
              <div className="mx-2 mb-2 h-px bg-border" />
            ) : (
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {section.title}
              </p>
            ))}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item);
              const body = (
                <>
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.soon && (
                    <span className="rounded bg-card-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      Soon
                    </span>
                  )}
                </>
              );
              const cls = cn(
                ROW,
                collapsed && 'justify-center',
                active
                  ? 'bg-brand-500/10 font-medium text-foreground'
                  : item.soon
                    ? 'cursor-default text-muted/50'
                    : 'text-muted hover:bg-card-muted hover:text-foreground',
              );
              const title = collapsed ? item.label : undefined;

              return (
                <li key={item.label}>
                  {item.soon || !item.href ? (
                    <span className={cls} title={title}>
                      {body}
                    </span>
                  ) : item.external ? (
                    <a href={item.href} className={cls} title={title}>
                      {body}
                    </a>
                  ) : (
                    <Link href={item.href} className={cls} title={title} aria-current={active ? 'page' : undefined}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Footer nav items (Sudo / Back to app). `children` adds extras (e.g. the
 *  desktop collapse toggle). Shared by the desktop sidebar and mobile drawer. */
export function SidebarFooter({
  footer = [],
  collapsed = false,
  children,
}: {
  footer?: NavFooterItem[];
  collapsed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 border-t border-border px-2 py-2">
      {footer.map((f) => {
        const Icon = ICONS[f.icon];
        const cls = cn(ROW, collapsed && 'justify-center', 'text-muted hover:bg-card-muted hover:text-foreground');
        return f.external ? (
          <a key={f.label} href={f.href} className={cls} title={collapsed ? f.label : undefined}>
            <Icon className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{f.label}</span>}
          </a>
        ) : (
          <Link key={f.label} href={f.href} className={cls} title={collapsed ? f.label : undefined}>
            <Icon className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{f.label}</span>}
          </Link>
        );
      })}
      {children}
    </div>
  );
}

/**
 * The desktop app shell sidebar: a header cell (org selector or brand mark),
 * grouped nav, and a bottom collapse toggle (persisted in localStorage). Hidden
 * below `md`; the mobile drawer (MobileNav, in the topbar) covers small screens.
 */
export function AppSidebar({
  sections,
  footer,
  orgs,
  activeSlug,
  brandHref,
  badge,
}: {
  sections: NavSection[];
  footer?: NavFooterItem[];
} & SidebarHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-border bg-card/30 md:flex',
        collapsed ? 'w-16' : 'w-64',
        ready && 'transition-[width] duration-150 ease-out',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-border px-2.5', collapsed && 'justify-center px-2')}>
        <SidebarHeaderContent
          orgs={orgs}
          activeSlug={activeSlug}
          brandHref={brandHref}
          badge={badge}
          collapsed={collapsed}
        />
      </div>
      <SidebarNav sections={sections} collapsed={collapsed} />
      <SidebarFooter footer={footer} collapsed={collapsed}>
        <button
          type="button"
          onClick={toggle}
          className={cn(ROW, collapsed && 'justify-center', 'w-full text-muted hover:bg-card-muted hover:text-foreground')}
          title={collapsed ? 'Expand sidebar' : undefined}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </SidebarFooter>
    </aside>
  );
}
