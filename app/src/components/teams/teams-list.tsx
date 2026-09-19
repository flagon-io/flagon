"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search, UsersRound } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Kbd,
  Skeleton,
} from "@flagon-io/ui";

type Team = {
  id: string;
  name: string;
  slug: string;
  description: string;
  member_count: number;
  created_at: string;
};

export function TeamsList({
  slug,
  canManage,
}: {
  slug: string;
  canManage: boolean;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Fetch one page of teams. Search (?q=) and paging (?cursor=) are server-side.
  const fetchPage = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(slug)}/teams?${params.toString()}`,
        { signal },
      );
      if (!res.ok) throw new Error(`teams ${res.status}`);
      return (await res.json()) as { items: Team[]; next: string | null };
    },
    [slug],
  );

  // Initial load of the first page.
  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage("", null);
        setTeams(data.items);
        setNext(data.next);
      } catch {
        setError("Couldn't load teams. Try refreshing the page.");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchPage]);

  // Debounced server-side search. The initial load above covers the first render.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetchPage(query.trim(), null, controller.signal);
        if (!controller.signal.aborted) {
          setTeams(data.items);
          setNext(data.next);
        }
      } catch {
        /* aborted or failed - leave the current list in place */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(query.trim(), next);
      setTeams((prev) => [...prev, ...data.items]);
      setNext(data.next);
    } catch {
      /* leave the list as-is on failure */
    } finally {
      setLoadingMore(false);
    }
  }, [next, query, fetchPage]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      filterRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    // The filter box drives server-side search (see the search effect); this only
    // sorts the rows already loaded.
    return [...teams].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams]);

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={filterRef}
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter teams..."
            aria-label="Filter teams"
            className="pr-10 pl-9"
          />
          <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
        </div>
        {canManage && (
          <Button asChild size="sm">
            <Link href={`/${slug}/teams/new`}>
              <Plus className="size-4" />
              New team
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <Card className="divide-y divide-hairline">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </Card>
      ) : rows.length === 0 ? (
        searching ? (
          <Card className="px-4 py-12 text-center text-sm text-muted-foreground">
            Searching...
          </Card>
        ) : (
          <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <UsersRound className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">
              {query ? "No teams match your filter" : "No teams yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A team is a named group of members you can grant access to projects all at once, rather
              than one person at a time.
            </p>
            {canManage && !query && (
              <Button asChild size="sm" className="mt-1">
                <Link href={`/${slug}/teams/new`}>
                  <Plus className="size-4" />
                  New team
                </Link>
              </Button>
            )}
          </Card>
        )
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {rows.map((t) => (
              <li key={t.id} className="transition-colors hover:bg-panel/40">
                <Link
                  href={`/${slug}/teams/${encodeURIComponent(t.slug)}`}
                  className="flex items-center gap-3 px-4 py-3 outline-none focus-visible:bg-panel/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <UsersRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.description || `@${t.slug}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {t.member_count} {t.member_count === 1 ? "member" : "members"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      {!loading && teams.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {teams.length} {teams.length === 1 ? "team" : "teams"}
          {next ? " loaded" : ""}
        </p>
      )}
    </div>
  );
}
