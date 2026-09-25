"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, GitBranch, Plus, Search } from "lucide-react";
import { Button, Input, Kbd } from "@flagon-io/ui";
import type { Page, Project } from "@/lib/api/types";
import { fetchJson, messageOf } from "@/lib/client-fetch";
import { ListError } from "@/components/shared/list-states";
import { LoadMore } from "./access/access-list-layout";

function repoHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Projects overview: a search toolbar over a grid of project cards. Search is
 *  server-side (debounced) and results page in via the API's Link header, so the
 *  list scales past what fits in one response. */
export function ProjectsBrowser({
  initialProjects,
  initialNext,
  orgSlug,
  canCreate,
}: {
  initialProjects: Project[];
  initialNext: string | null;
  orgSlug: string;
  canCreate: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [next, setNext] = useState<string | null>(initialNext);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // A failed search replaces the list with an error (the rows shown would no
  // longer match the query); a failed "load more" keeps the rows and says so.
  const [listError, setListError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  const fetchPage = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      return fetchJson<Page<Project>>(
        `/api/orgs/${encodeURIComponent(orgSlug)}/projects?${params.toString()}`,
        { signal },
        "Couldn't load projects.",
      );
    },
    [orgSlug],
  );

  // Debounced server-side search. The first render already has the initial page
  // from the server, so it is skipped.
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
          setProjects(data.items);
          setNext(data.next);
          setListError(null);
          setMoreError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) setListError(messageOf(e, "Couldn't load projects."));
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, fetchPage, retry]);

  // Press "/" anywhere to jump to search, unless already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable)
        return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const data = await fetchPage(query.trim(), next);
      setProjects((prev) => [...prev, ...data.items]);
      setNext(data.next);
    } catch (e) {
      setMoreError(messageOf(e, "Couldn't load more projects."));
    } finally {
      setLoadingMore(false);
    }
  }, [next, query, fetchPage]);

  const empty = projects.length === 0 && !searching;
  const retrySearch = () => {
    setListError(null);
    setRetry((n) => n + 1);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
            className="pr-10 pl-10"
          />
          <Kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">/</Kbd>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href={`/${orgSlug}/projects/new`}>
              <Plus className="size-4" />
              New project
            </Link>
          </Button>
        )}
      </div>

      {listError ? (
        <div className="mt-5">
          <ListError title="Couldn't load projects" message={listError} onRetry={retrySearch} />
        </div>
      ) : empty ? (
        query ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No projects match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-hairline bg-card px-6 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Boxes className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first project to get started.
              </p>
            </div>
            {canCreate && (
              <Button asChild size="sm" className="mt-1">
                <Link href={`/${orgSlug}/projects/new`}>
                  <Plus className="size-4" />
                  New project
                </Link>
              </Button>
            )}
          </div>
        )
      ) : (
        <>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const host = repoHost(p.repository_url);
              return (
                <li key={p.id}>
                  <Link
                    href={`/${orgSlug}/projects/${p.slug}`}
                    className="group block h-full rounded-xl border border-hairline bg-card p-4 outline-none transition-colors hover:border-muted-foreground/30 hover:bg-panel focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Boxes className="size-4" />
                      </span>
                      <span className="truncate font-medium text-foreground">{p.name}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-8 text-sm text-muted-foreground">
                      {p.description || "No description"}
                    </p>
                    {host && (
                      <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <GitBranch className="size-3.5 shrink-0" />
                        {host}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {next && (
            <div className="mt-6">
              <LoadMore
                next={next}
                loading={loadingMore}
                error={moreError}
                onLoadMore={() => void loadMore()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
