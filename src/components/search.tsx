"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { BookOpen, FileText, Library, Newspaper, Search as SearchIcon } from "lucide-react";
import type { SearchDoc } from "@/lib/search";

const GROUPS = ["Pages", "Handbook", "Books", "Blog"] as const;
const GROUP_ICON = { Pages: FileText, Handbook: BookOpen, Books: Library, Blog: Newspaper };

/**
 * Title-weighted substring scoring. Beats cmdk's default fuzzy matcher for docs:
 * a title hit ranks above a keyword (section/slug/description) hit, and loose
 * subsequence junk is dropped entirely.
 */
function score(value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const title = value.toLowerCase();
  const hay = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 0.8;
  if (hay.includes(q)) return 0.55;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => hay.includes(w))) return 0.35;
  return 0;
}

/**
 * Site-wide search. A command palette (Radix Dialog via cmdk, so focus trap,
 * scroll lock, Escape, and ARIA are handled) over every page, handbook page, and
 * blog post. Opens from the header button or the global Cmd/Ctrl+K shortcut. The
 * index is fetched lazily on first open from the prerendered /search-index.json.
 */
export function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchDoc[] | null>(null);

  // Global Cmd/Ctrl+K toggles the palette; a custom "flagon:opensearch" event
  // opens it, so any trigger on the page can pop the same dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("flagon:opensearch", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("flagon:opensearch", onOpen);
    };
  }, []);

  // Fetch the index the first time the palette opens.
  useEffect(() => {
    if (!open || index) return;
    fetch("/search-index.json")
      .then((r) => r.json())
      .then((data: SearchDoc[]) => setIndex(data))
      .catch(() => setIndex([]));
  }, [open, index]);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const go = useCallback(
    (url: string) => {
      onOpenChange(false);
      router.push(url);
    },
    [onOpenChange, router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-8 items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 text-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
      >
        <SearchIcon className="h-4 w-4" strokeWidth={2} />
        <span className="hidden text-sm text-muted-foreground lg:inline">Search</span>
        <kbd className="hidden rounded border border-hairline bg-background px-1.5 font-mono text-[10px] leading-4 text-subtle lg:inline">
          ⌘K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        label="Search Flagon"
        shouldFilter
        filter={score}
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search the docs, handbook, and more…"
        />
        <Command.List>
          <Command.Empty>
            {index === null ? "Loading…" : `No results for “${query}”.`}
          </Command.Empty>

          {index &&
            GROUPS.map((group) => {
              const items = index.filter((d) => d.group === group);
              if (!items.length) return null;
              const Icon = GROUP_ICON[group];
              return (
                <Command.Group key={group} heading={group}>
                  {items.map((d) => {
                    const slug = d.url.split("/").pop() ?? "";
                    const keywords = [d.section, d.description, slug.replace(/-/g, " ")].filter(
                      (k): k is string => Boolean(k),
                    );
                    return (
                      <Command.Item
                        key={d.url}
                        value={d.title}
                        keywords={keywords}
                        onSelect={() => go(d.url)}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                        <span className="flex-1 truncate">{d.title}</span>
                        {d.section ? (
                          <span className="shrink-0 text-xs text-subtle">{d.section}</span>
                        ) : null}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
