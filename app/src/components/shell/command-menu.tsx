"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import {
  Badge,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
} from "@flagon-io/ui";
import { useAgent } from "@/components/agent/agent-provider";
import { commandItems, type CommandItem as NavCommandItem } from "./nav";

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
      <CommandDialogMenu slug={slug} open={open} onOpenChange={setOpen} />
    </div>
  );
}

type Row = { kind: "item"; item: NavCommandItem } | { kind: "ask"; query: string };

function CommandDialogMenu({
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

  const items = useMemo(() => commandItems(slug), [slug]);
  // Preserve first-seen group order for the section headings.
  const grouped = useMemo(() => {
    const map = new Map<string, NavCommandItem[]>();
    for (const it of items) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return [...map.entries()];
  }, [items]);

  const handleOpenChange = useCallback(
    (o: boolean) => {
      if (!o) setQ("");
      onOpenChange(o);
    },
    [onOpenChange],
  );

  const run = useCallback(
    (row: Row) => {
      handleOpenChange(false);
      if (row.kind === "item") router.push(row.item.href);
      else void send(row.query);
    },
    [handleOpenChange, router, send],
  );

  // cmdk owns arrows / Enter / typeahead filtering. We add one shortcut on top:
  // Shift+Enter always hands the current query to Ask AI, whatever is highlighted.
  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.shiftKey && q.trim()) {
      e.preventDefault();
      e.stopPropagation();
      run({ kind: "ask", query: q.trim() });
    }
  }

  const query = q.trim();

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Search and quick actions">
      <CommandInput
        autoFocus
        value={q}
        onValueChange={setQ}
        onKeyDown={onInputKeyDown}
        placeholder="Search or ask AI..."
      />
      <CommandList className="max-h-[min(24rem,60vh)]">
        {grouped.map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={`${item.group}:${item.href}`}
                  // value + group keeps values unique (avoids same-label collisions)
                  // and both are useful search terms; synonyms go in keywords.
                  value={`${item.label} ${item.group}`}
                  keywords={item.keywords ? item.keywords.split(/\s+/) : undefined}
                  onSelect={() => run({ kind: "item", item })}
                >
                  {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <Badge variant="outline">{item.badge}</Badge>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {/* The Ask AI fallthrough: force-mounted so it survives an empty filter -
            the "not what I meant" escape hatch is always one Enter away. */}
        {query && (
          <CommandGroup forceMount className="border-t border-hairline">
            <CommandItem forceMount value={`ask ${query}`} onSelect={() => run({ kind: "ask", query })}>
              <Sparkles className="size-4 shrink-0 text-brand-bright" />
              <span className="flex-1 truncate">
                Ask AI <span className="text-muted-foreground">- &ldquo;{query}&rdquo;</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>

      <div className="flex items-center gap-4 border-t border-hairline px-3 py-2 text-2xs text-muted-foreground">
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
    </CommandDialog>
  );
}
