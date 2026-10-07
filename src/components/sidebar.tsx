"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One reusable docs-style sidebar, shared by the handbook and the product docs
 * (and anything else that needs a sectioned nav). Improve it here and every
 * surface benefits. Callers map their own data into this normalized shape.
 *
 * Structure: an optional run of ungrouped sections, then labelled groups. Each
 * section is a full-width collapsible row (Radix Accordion, so keyboard + aria
 * are handled); the section owning the current page starts open. A `disabled`
 * section renders as a non-collapsible "Soon" row; an item `badge` renders a pill
 * and dims the row; an item `number` renders a zero-padded index (chapters).
 */

export type SidebarItem = {
  href: string;
  title: string;
  number?: number;
  badge?: string;
};

/** A small sub-heading inside a section that labels the items after it. */
export type SidebarSeparator = { separator: string };

export type SidebarSection = {
  name: string;
  items: (SidebarItem | SidebarSeparator)[];
  /** A section we haven't built yet: a disabled row with a badge, no children. */
  disabled?: boolean;
  badge?: string;
};

export type SidebarGroup = {
  /** null = an ungrouped run at the top, rendered without a category band. */
  name: string | null;
  sections: SidebarSection[];
};

export type SidebarNavProps = {
  title: string;
  homeHref: string;
  homeLabel: string;
  groups: SidebarGroup[];
  /**
   * "compact" labels sections in sentence case (group headings stay the small
   * uppercase bands) and renders a section holding a single page as a direct
   * link instead of a one-item collapsible. The default keeps the uppercase
   * section rows the handbook uses.
   */
  variant?: "default" | "compact";
};

export function SidebarNav({
  title,
  homeHref,
  homeLabel,
  groups,
  variant = "default",
}: SidebarNavProps) {
  const compact = variant === "compact";
  const pathname = usePathname();
  const allSections = groups.flatMap((g) => g.sections);
  const activeSection = allSections.find((s) =>
    s.items.some((i) => "href" in i && i.href === pathname),
  )?.name;

  const [open, setOpen] = useState<string[]>(
    activeSection ? [activeSection] : allSections[0] ? [allSections[0].name] : [],
  );

  // Keep the section owning the current page open across navigation, without
  // collapsing what the reader opened (adjust-during-render).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (activeSection && !open.includes(activeSection)) {
      setOpen((o) => (o.includes(activeSection) ? o : [...o, activeSection]));
    }
  }

  return (
    <nav aria-label={title} className="text-[13px]">
      <p className="border-b border-hairline bg-panel px-4 py-2.5 text-[13px] font-semibold tracking-tight text-foreground">
        {title}
      </p>
      <div className="px-2 py-2">
        <Link
          href={homeHref}
          aria-current={pathname === homeHref ? "page" : undefined}
          className={cn(
            "block rounded-md px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
            pathname === homeHref
              ? "bg-foreground/10 font-medium text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          {homeLabel}
        </Link>
      </div>

      <Accordion.Root
        type="multiple"
        value={open}
        onValueChange={setOpen}
        className="flex flex-col border-t border-hairline"
      >
        {groups.map((group) => (
          <div key={group.name ?? "_top"}>
            {group.name ? (
              <p className="border-b border-hairline bg-panel px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
                {group.name}
              </p>
            ) : null}
            {compact && isFlatGroup(group) ? (
              <FlatSection section={group.sections[0]} pathname={pathname} />
            ) : null}
            {(compact && isFlatGroup(group) ? [] : group.sections).map((section) =>
              compact && isSinglePage(section) ? (
                <SingleRow
                  key={section.name}
                  section={section}
                  pathname={pathname}
                  indented={group.name !== null}
                />
              ) : section.disabled ? (
                <SoonRow key={section.name} name={section.name} badge={section.badge} indented={group.name !== null} />
              ) : (
                <SectionItem
                  key={section.name}
                  section={section}
                  pathname={pathname}
                  indented={group.name !== null}
                  compact={compact}
                />
              ),
            )}
          </div>
        ))}
      </Accordion.Root>
    </nav>
  );
}

function SoonRow({ name, badge, indented }: { name: string; badge?: string; indented: boolean }) {
  return (
    <div
      aria-disabled
      className={cn(
        "flex items-center gap-2 border-b border-hairline py-2.5 pr-4 font-mono text-[11px] uppercase tracking-widest text-subtle/60",
        indented ? "pl-6" : "pl-4",
      )}
    >
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" strokeWidth={2} aria-hidden />
      <span className="flex-1 text-left">{name}</span>
      {badge ? (
        <span className="rounded-full border border-hairline px-1.5 py-px text-[9px] leading-tight tracking-widest text-subtle">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function isSinglePage(section: SidebarSection): boolean {
  return (
    !section.disabled &&
    section.items.length === 1 &&
    "href" in section.items[0]
  );
}

/**
 * A group whose only section repeats the group's name ("Get started" holding
 * "Get started") adds a pointless level: list its pages directly instead.
 */
function isFlatGroup(group: SidebarGroup): boolean {
  const only = group.sections.length === 1 ? group.sections[0] : null;
  return (
    !!only &&
    !only.disabled &&
    group.name !== null &&
    only.name.trim().toLowerCase() === group.name.trim().toLowerCase()
  );
}

/** A flat group's pages as direct link rows (compact variant). */
function FlatSection({ section, pathname }: { section: SidebarSection; pathname: string }) {
  return (
    <div className="border-b border-hairline py-1.5">
      {section.items.map((item, idx) =>
        "separator" in item ? (
          <p
            key={`sep-${idx}`}
            className="px-6 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle"
          >
            {item.separator}
          </p>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={cn(
              "mx-2 flex items-center gap-2 rounded-md py-2 pl-4 pr-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
              pathname === item.href
                ? "bg-foreground/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <span className="flex-1">{item.title}</span>
            {item.badge ? (
              <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] uppercase leading-tight tracking-widest text-subtle">
                {item.badge}
              </span>
            ) : null}
          </Link>
        ),
      )}
    </div>
  );
}

/** A section with one page, shown as a direct link row (compact variant). */
function SingleRow({
  section,
  pathname,
  indented,
}: {
  section: SidebarSection;
  pathname: string;
  indented: boolean;
}) {
  const item = section.items[0] as SidebarItem;
  const active = pathname === item.href;
  const badge = section.badge ?? item.badge;
  return (
    <div className="border-b border-hairline">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 py-2.5 pr-4 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
          indented ? "pl-6" : "pl-4",
          active
            ? "bg-foreground/10 font-medium text-foreground"
            : badge
              ? "text-subtle hover:bg-panel hover:text-muted-foreground"
              : "text-muted-foreground hover:bg-panel hover:text-foreground",
        )}
      >
        <span className="w-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{section.name}</span>
        {badge ? (
          <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] uppercase leading-tight tracking-widest text-subtle">
            {badge}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

function SectionItem({
  section,
  pathname,
  indented,
  compact = false,
}: {
  section: SidebarSection;
  pathname: string;
  indented: boolean;
  compact?: boolean;
}) {
  const numbered = section.items.some((i) => "href" in i && i.number != null);
  return (
    <Accordion.Item value={section.name} className="border-b border-hairline">
      <Accordion.Header>
        <Accordion.Trigger
          className={cn(
            "group flex w-full items-center gap-2 py-2.5 pr-4 outline-none transition-[color,background-color] hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand data-[state=open]:text-foreground",
            "data-[state=open]:border-b data-[state=open]:border-hairline",
            compact
              ? "text-[13px] font-medium text-muted-foreground"
              : "font-mono text-[11px] uppercase tracking-widest text-subtle",
            indented ? "pl-6" : "pl-4",
          )}
        >
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90"
            strokeWidth={2}
            aria-hidden
          />
          <span className="flex-1 text-left">{section.name}</span>
          {section.badge ? (
            <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] uppercase leading-tight tracking-widest text-subtle">
              {section.badge}
            </span>
          ) : null}
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="acc-content overflow-hidden">
        <ul className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
          {section.items.map((item, idx) => {
            if (!("href" in item)) {
              return (
                <li
                  key={`sep-${idx}-${item.separator}`}
                  role="presentation"
                  className={cn(
                    "pb-1 pr-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
                    idx === 0 ? "pt-1.5" : "pt-3.5",
                    indented ? "pl-5" : "pl-3",
                  )}
                >
                  {item.separator}
                </li>
              );
            }
            const active = pathname === item.href;
            const dim = Boolean(item.badge) && !active;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-baseline gap-2 rounded-md py-2 pr-2.5 leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                    numbered ? "pl-2" : indented ? "pl-5" : "pl-3",
                    active
                      ? "bg-foreground/10 font-medium text-foreground"
                      : dim
                        ? "text-subtle hover:bg-foreground/5 hover:text-muted-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  {item.number != null ? (
                    <span
                      className={cn(
                        "w-5 shrink-0 font-mono text-[10px] tabular-nums",
                        active ? "text-foreground/70" : "text-subtle",
                      )}
                    >
                      {String(item.number).padStart(2, "0")}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">{item.title}</span>
                  {item.badge ? (
                    <span className="shrink-0 self-center rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] uppercase leading-tight tracking-widest text-subtle">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </Accordion.Content>
    </Accordion.Item>
  );
}

/**
 * Small-screen docked nav: a bar that stays pinned just under the site header
 * while the page scrolls, opening a <SidebarNav> as a dropdown panel beneath it.
 * Hidden at `lg`, where the rail is shown inline instead.
 *
 * For the bar to stay docked across the whole article (not just the sidebar's own
 * height), it must live in the tall grid container that spans nav + content, so
 * layouts render this as the first grid child, with the inline rail as a sibling
 * <aside> that only appears at `lg`. The panel is absolutely positioned against
 * this sticky wrapper, so it drops from wherever the bar is currently docked.
 */
export function MobileSidebar({
  toggleLabel,
  tools,
  children,
}: {
  toggleLabel: string;
  /** Controls docked beside the nav button, e.g. a book's reading depth. */
  tools?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close when the route changes (a link was followed). Adjusting state during
  // render on a changed value is the sanctioned pattern, no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // While open: Escape to close, close on outside click, and lock the page
  // behind the panel so it doesn't scroll under the dropdown.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      root.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="sticky top-16.25 z-30 border-b border-hairline bg-background/80 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center justify-between rounded-md border border-hairline bg-panel px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="truncate">{toggleLabel}</span>
          <ChevronDown
            className={cn("h-4 w-4 text-subtle transition-transform", open && "rotate-180")}
            strokeWidth={2}
          />
        </button>
        {tools ? <div className="shrink-0">{tools}</div> : null}
      </div>
      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain border-b border-hairline bg-background shadow-xl shadow-black/30"
      >
        {children}
      </div>
    </div>
  );
}
