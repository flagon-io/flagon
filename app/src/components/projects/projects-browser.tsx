"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, GitBranch, Plus, Search } from "lucide-react";
import { Button, Input, Kbd } from "@flagon-io/ui";
import type { Project } from "@/lib/flagon-api";

function repoHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Projects overview: a search toolbar (no page header) over a grid of project
 *  cards, filtered client-side. */
export function ProjectsBrowser({
  projects,
  orgSlug,
  canCreate,
}: {
  projects: Project[];
  orgSlug: string;
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere on the page to jump to the search box, unless you're
  // already typing in a field.
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      `${p.name} ${p.description} ${p.repository_url}`.toLowerCase().includes(q),
    );
  }, [projects, query]);

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

      {projects.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-hairline bg-card px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Boxes className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first project to get started.</p>
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
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No projects match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
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
        <p className="mt-4 text-xs text-muted-foreground">
          {query
            ? `${filtered.length} of ${projects.length} projects`
            : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </p>
        </>
      )}
    </div>
  );
}
