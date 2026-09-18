"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogPanel,
  DialogTitle,
  Badge,
  Kbd,
  cn,
} from "@flagon-io/ui";
import { useAgent } from "@/components/agent/agent-provider";
import { commandItems, type CommandItem } from "./nav";

// Client-only reads without a setState-in-effect: server snapshot is the neutral
// default, and useSyncExternalStore swaps to the client value after hydration.
const noopSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

// Quick-search that falls through to the AI: navigation typeahead first, and when
// nothing matches (or the user prefers), the same query is handed to Ask AI. The
// AI stays the single "I don't know where this lives" entry point.
export function CommandMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const isMac = useIsMac();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="px-2 pb-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Quick search"
        aria-label="Quick search"
        className="flex h-9 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm text-sidebar-foreground/50 outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">Quick search...</span>
        {hydrated && (
          <Kbd className="border-sidebar-border bg-transparent text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
            {isMac ? "⌘" : "Ctrl"} K
          </Kbd>
        )}
      </button>
      <CommandDialog slug={slug} open={open} onOpenChange={setOpen} />
    </div>
  );
}

type Row = { kind: "item"; item: CommandItem } | { kind: "ask"; query: string };

function CommandDialog({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { send } = useAgent();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => commandItems(slug), [slug]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    const terms = query.split(/\s+/);
    return items.filter((it) => {
      const hay = `${it.label} ${it.keywords ?? ""} ${it.group}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, q]);

  // The interactive rows: matched destinations, then an Ask AI fallthrough when
  // there's a query - it's the "not what I meant" escape hatch.
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = filtered.map((item) => ({ kind: "item", item }));
    const query = q.trim();
    if (query) r.push({ kind: "ask", query });
    return r;
  }, [filtered, q]);

  // Clamp the selection into range at render time (the result set shrinks as you
  // type) instead of chasing it with a reset effect.
  const activeIndex = rows.length ? Math.min(active, rows.length - 1) : 0;

  const close = useCallback(() => {
    setQ("");
    setActive(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleOpenChange = useCallback(
    (o: boolean) => {
      if (!o) {
        setQ("");
        setActive(0);
      }
      onOpenChange(o);
    },
    [onOpenChange],
  );

  const run = useCallback(
    (row: Row) => {
      close();
      if (row.kind === "item") {
        router.push(row.item.href);
      } else {
        void send(row.query);
      }
    },
    [close, router, send],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(rows.length ? (activeIndex + 1) % rows.length : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(rows.length ? (activeIndex - 1 + rows.length) % rows.length : 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Shift+Enter always asks the AI with the current query.
        if (e.shiftKey && q.trim()) {
          run({ kind: "ask", query: q.trim() });
        } else if (rows[activeIndex]) {
          run(rows[activeIndex]);
        }
      }
    },
    [rows, activeIndex, q, run],
  );

  // Keep the active row scrolled into view as you arrow through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        {/* Overlay is the flex centering context, so the panel sits centered and
         * top-anchored regardless of any transformed ancestor. */}
        <DialogOverlay className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[12vh] backdrop-blur-[1px]">
          <DialogPanel className="w-[min(40rem,92vw)] overflow-hidden rounded-xl border border-hairline bg-popover text-popover-foreground shadow-2xl outline-none">
            <DialogTitle className="sr-only">Search and quick actions</DialogTitle>

        <div className="flex items-center gap-2.5 border-b border-hairline px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search or ask AI..."
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}

          {rows.map((row, index) => {
            const isActive = index === activeIndex;

            if (row.kind === "ask") {
              return (
                <div key="ask" className="mt-1 border-t border-hairline pt-1.5">
                  <button
                    type="button"
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(row)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none",
                      isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    <Sparkles className="size-4 shrink-0 text-brand-bright" />
                    <span className="flex-1 truncate">
                      Ask AI <span className="text-muted-foreground">- &ldquo;{row.query}&rdquo;</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              );
            }

            const { item } = row;
            // First item of its group (previous row is a different group or a
            // non-item) gets a header. Pure derivation, no render-time mutation.
            const prev = rows[index - 1];
            const header =
              !prev || prev.kind !== "item" || prev.item.group !== item.group
                ? item.group
                : null;
            const Icon = item.icon;

            return (
              <div key={`${item.group}:${item.href}`}>
                {header && (
                  <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(row)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none",
                    isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <Badge variant="outline">{item.badge}</Badge>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>{"↑"}</Kbd>
            <Kbd>{"↓"}</Kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>{"↵"}</Kbd>
            to select
          </span>
          <span className="flex items-center gap-1">
            <Kbd>{"⇧"}</Kbd>
            <Kbd>{"↵"}</Kbd>
            to ask AI
          </span>
            </div>
          </DialogPanel>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
