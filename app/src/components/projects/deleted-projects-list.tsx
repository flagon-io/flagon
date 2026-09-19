"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, RotateCcw, Search } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { Project } from "@/lib/flagon-api";
import { timeAgo } from "@/lib/notifications";

export function DeletedProjectsList({
  slug,
  initial,
  initialNext = null,
}: {
  slug: string;
  initial: Project[];
  initialNext?: string | null;
}) {
  const [projects, setProjects] = useState<Project[]>(initial);
  const [next, setNext] = useState<string | null>(initialNext);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);

  const fetchPage = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(slug)}/deleted-projects?${params.toString()}`,
        { signal },
      );
      if (!res.ok) throw new Error(`deleted-projects ${res.status}`);
      return (await res.json()) as { items: Project[]; next: string | null };
    },
    [slug],
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
      setProjects((prev) => [...prev, ...data.items]);
      setNext(data.next);
    } catch {
      /* leave the list as-is on failure */
    } finally {
      setLoadingMore(false);
    }
  }, [next, query, fetchPage]);

  async function restore(project: Project) {
    setError(null);
    setBusy(project.id);
    try {
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project.slug)}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not restore this project.");
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore this project.");
    } finally {
      setBusy(null);
    }
  }

  const empty = projects.length === 0 && !searching;

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deleted projects..."
          aria-label="Search deleted projects"
          className="pl-9"
        />
      </div>

      {empty ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <Boxes className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {query ? "No deleted projects match your search" : "No deleted projects"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            When you delete a project it lands here, ready to restore.
          </p>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{project.name}</span>
                        <Badge variant="outline" className="font-mono">
                          {project.slug}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.deleted_at ? timeAgo(project.deleted_at) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restore(project)}
                        disabled={busy === project.id}
                      >
                        <RotateCcw className="size-4" />
                        {busy === project.id ? "Restoring..." : "Restore"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {next && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
