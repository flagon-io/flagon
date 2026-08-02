"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BookText, ChevronRight, X } from "lucide-react";
import { nav, flatNav, isGroup, type NavGroup, type NavLeaf } from "@/lib/docs-nav";

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** A small amber pill marking a page or product that isn't documented yet. */
function SoonBadge() {
  return (
    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
      Soon
    </span>
  );
}

/** A single page row: a link, or a muted "Soon" placeholder when it has no page. */
function Leaf({
  item,
  pathname,
  onNavigate,
}: {
  item: NavLeaf;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (item.soon || !item.href) {
    return (
      <div className="flex items-center rounded-md px-3 py-1.5 text-zinc-600">
        <span>{item.title}</span>
        <span className="ml-auto">
          <SoonBadge />
        </span>
      </div>
    );
  }
  const active = normalize(item.href) === pathname;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={
        "block rounded-md px-3 py-1.5 transition " +
        (active
          ? "bg-teal-400/10 font-medium text-teal-300"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")
      }
    >
      {item.title}
    </Link>
  );
}

/**
 * A collapsible group of pages. Open by default when it contains the page you're
 * on (so the current page is never hidden), and toggleable from there.
 */
function Group({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const contains = group.items.some(
    (i) => i.href && normalize(i.href) === pathname,
  );
  // Manual expand/collapse for THIS group, reset whenever you navigate: so a
  // group you opened auto-collapses once you leave its section, and only the
  // section you're in stays open. (During-render reset, React's documented
  // "adjust state from the previous render" pattern.)
  const [override, setOverride] = useState<boolean | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOverride(null);
  }
  const open = override ?? contains;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className={
          "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition " +
          (group.soon
            ? "text-zinc-600"
            : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100")
        }
      >
        <span className={group.soon ? undefined : "font-medium"}>
          {group.title}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {group.soon ? <SoonBadge /> : null}
          <ChevronRight
            className={
              "size-3.5 text-zinc-500 transition-transform " +
              (open ? "rotate-90" : "")
            }
          />
        </span>
      </button>
      {open ? (
        <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-white/10 pl-2">
          {group.items.map((child) => (
            <li key={child.href ?? child.title}>
              <Leaf item={child} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = normalize(usePathname());
  return (
    <nav className="flex flex-col gap-6 text-sm">
      {nav.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-3 text-xs font-semibold tracking-wide text-zinc-600 uppercase">
            {section.title}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) =>
              isGroup(item) ? (
                <Group
                  key={item.title}
                  group={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ) : (
                <li key={item.href ?? item.title}>
                  <Leaf item={item} pathname={pathname} onNavigate={onNavigate} />
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Pager() {
  const pathname = normalize(usePathname());
  const idx = flatNav.findIndex((i) => normalize(i.href) === pathname);
  if (idx === -1) return null;
  const prev = idx > 0 ? flatNav[idx - 1] : null;
  const next = idx < flatNav.length - 1 ? flatNav[idx + 1] : null;

  return (
    <div className="mt-16 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col rounded-lg border border-white/10 px-4 py-3 transition hover:border-white/20 hover:bg-white/5"
        >
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <ArrowLeft className="size-3" /> Previous
          </span>
          <span className="mt-1 text-sm font-medium text-zinc-200 group-hover:text-teal-300">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col rounded-lg border border-white/10 px-4 py-3 text-right transition hover:border-white/20 hover:bg-white/5"
        >
          <span className="flex items-center justify-end gap-1 text-xs text-zinc-500">
            Next <ArrowRight className="size-3" />
          </span>
          <span className="mt-1 text-sm font-medium text-zinc-200 group-hover:text-teal-300">
            {next.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

/**
 * The docs chrome inside the marketing shell: a sticky left sidebar on desktop,
 * a slide-in drawer on mobile, and prev/next paging. The global SiteHeader
 * (rendered by the docs layout) is the top bar, so this owns only the sidebar
 * and content column, offset below the 4rem header.
 */
export function DocsChrome({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 sm:px-6 lg:gap-12">
      {/* Desktop sidebar */}
      <aside className="docs-scroll sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto py-10 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 top-16 z-30 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside className="docs-scroll absolute top-0 left-0 h-full w-72 overflow-y-auto border-r border-white/10 bg-[#0b0f10] p-6">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5"
              >
                <X className="size-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 py-8 lg:py-10">
        {/* Mobile "open docs nav" trigger. Language selection lives inline on
            each code sample (see CodeGroup), not as a global page control. */}
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
          >
            <BookText className="size-4" /> Menu
          </button>
        </div>
        <article className="prose-docs max-w-4xl">{children}</article>
        <div className="max-w-4xl">
          <Pager />
        </div>
      </main>
    </div>
  );
}
