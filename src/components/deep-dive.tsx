"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { slug } from "github-slugger";
import { cn } from "@/lib/cn";

/**
 * The book reads two ways from one text. Each chapter is a short essay track
 * plus <DeepDive title="..."> blocks for the internals, the exhaustive
 * measurements, and the edge cases. Readers pick a depth for the whole book
 * (DepthToggle); in Simple mode each deep dive collapses to a one-line teaser
 * that opens on its own. The choice is applied before first paint by
 * DepthScript, so nothing flashes open and shut.
 *
 * Print renders deep dives inline with their own treatment instead (see
 * components/book-print.tsx).
 */

const STORAGE_KEY = "flagon-depth";
/** Fired on window when the depth changes, so every switch on the page agrees. */
const DEPTH_EVENT = "flagon-depth-change";
export type Depth = "simple" | "deep";

/** Sets <html data-depth> before first paint. Simple unless the reader chose deep. */
const script = `(function(){try{var d=localStorage.getItem("${STORAGE_KEY}");document.documentElement.dataset.depth=d==="deep"?"deep":"simple"}catch(e){document.documentElement.dataset.depth="simple"}})();`;

export function DepthScript() {
  // Same pattern as ThemeScript: executable on the server render, inert text on
  // a client render (where a <script> never runs and React would warn).
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}

/** Read the depth the pre-paint script settled on. */
function currentDepth(): Depth {
  if (typeof document === "undefined") return "simple";
  return document.documentElement.dataset.depth === "deep" ? "deep" : "simple";
}

/** Apply and remember a depth for the whole book. */
function applyDepth(next: Depth) {
  document.documentElement.setAttribute("data-depth", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or blocked storage: the switch still works for this page.
  }
  window.dispatchEvent(new CustomEvent(DEPTH_EVENT, { detail: next }));
}

/** The book-wide Simple / Deep dive switch. */
export function DepthToggle({ className }: { className?: string }) {
  const [depth, setDepth] = useState<Depth>(currentDepth);
  // There can be more than one switch on a page (the desktop rail and the
  // mobile bar); keep them all showing the same choice.
  useEffect(() => {
    const sync = (e: Event) => setDepth((e as CustomEvent<Depth>).detail);
    window.addEventListener(DEPTH_EVENT, sync);
    return () => window.removeEventListener(DEPTH_EVENT, sync);
  }, []);
  const choose = (next: Depth) => {
    setDepth(next);
    applyDepth(next);
  };
  const options: { value: Depth; label: string }[] = [
    { value: "simple", label: "Simple" },
    { value: "deep", label: "Deep dive" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Reading depth"
      className={cn("inline-flex rounded-md border border-hairline bg-panel p-0.5 text-xs", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={depth === o.value}
          onClick={() => choose(o.value)}
          // The server can't know the stored choice; the pre-paint attribute
          // drives the styling, so a mismatch here never shows.
          suppressHydrationWarning
          className={cn(
            "whitespace-nowrap rounded px-2.5 py-1 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
            depth === o.value
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The book-wide depth switch with its label, for the reader's chrome: the top
 * of the sidebar on wide screens, the docked bar on small ones. It's global on
 * purpose; the choice applies to every chapter and persists.
 */
export function DepthControl({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", compact ? "" : "justify-between")}>
      {compact ? null : (
        <span className="hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-subtle lg:inline">Depth</span>
      )}
      <DepthToggle />
    </div>
  );
}

/** One deep-dive block in a chapter. */
export function DeepDive({ title, children }: { title: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const id = slug(title);

  // A link can point at a deep dive or at a heading inside one. In Simple mode
  // the body is hidden, so the target couldn't be scrolled to: open the deep
  // dive first, then bring the target into view once it's laid out. Covers
  // arriving with the hash, the hash changing, and same-page links (which
  // update the URL without a hashchange event).
  useEffect(() => {
    const reveal = (hash: string) => {
      const target = decodeURIComponent(hash.replace(/^#/, ""));
      if (!target || !ref.current) return;
      const hit = target === id || ref.current.querySelector(`[id="${CSS.escape(target)}"]`);
      if (!hit) return;
      setOpen(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" })),
      );
    };
    reveal(window.location.hash);
    const onHash = () => reveal(window.location.hash);
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.pathname === window.location.pathname) reveal(url.hash);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [id]);

  return (
    // Linkable like a heading: the id is the title, slugged the same way.
    <section
      ref={ref}
      id={id}
      className="deep-dive scroll-mt-24"
      data-open={open ? "" : undefined}
      aria-label={`Deep dive: ${title}`}
    >
      <div className="deep-dive-head">
        <span className="deep-dive-label">
          <Layers className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          <span className="deep-dive-label-text">Deep dive</span>
        </span>
        <span className="deep-dive-title">{title}</span>
        <button
          type="button"
          className="deep-dive-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Collapse" : "Read it"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
      <div className="deep-dive-body">{children}</div>
    </section>
  );
}
