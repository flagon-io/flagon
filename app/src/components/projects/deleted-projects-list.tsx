"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, RotateCcw, Search } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  InputGroup,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { Page, Project } from "@/lib/api/types";
import { fetchJson, messageOf } from "@/lib/client-fetch";
import { HttpError } from "@/lib/http-error";
import { ListError } from "@/components/shared/list-states";
import { LoadMore } from "./access/access-list-layout";
import { timeAgo } from "@/lib/notifications";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function daysLeft(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * The org's deleted-projects archive: projects deleted in the last 30 days.
 * Restore tries the old slug first; if a live project has taken it since (409),
 * a dialog asks for a new one.
 */
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
  // A failed search replaces the list with an error (the rows shown would no
  // longer match the query); a failed "load more" keeps the rows and says so.
  const [listError, setListError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The project waiting on a new slug (its old one was taken), if any.
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const firstRender = useRef(true);

  const fetchPage = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      return fetchJson<Page<Project>>(
        `/api/orgs/${encodeURIComponent(slug)}/deleted-projects?${params.toString()}`,
        { signal },
        "Couldn't load deleted projects.",
      );
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
          setListError(null);
          setMoreError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) setListError(messageOf(e, "Couldn't load deleted projects."));
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, fetchPage, retry]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const data = await fetchPage(query.trim(), next);
      setProjects((prev) => [...prev, ...data.items]);
      setNext(data.next);
    } catch (e) {
      setMoreError(messageOf(e, "Couldn't load more deleted projects."));
    } finally {
      setLoadingMore(false);
    }
  }, [next, query, fetchPage]);

  async function restore(project: Project, slugOverride?: string) {
    setError(null);
    setDialogError(null);
    setBusy(project.id);
    try {
      await fetchJson(
        `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project.slug)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slugOverride ? { slug: slugOverride } : {}),
        },
        "Could not restore this project.",
      );
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setRenaming(null);
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        if (!renaming) setNewSlug(`${project.slug}-2`);
        setRenaming(project);
        if (slugOverride) setDialogError(e.message);
      } else if (renaming) {
        setDialogError(messageOf(e, "Could not restore this project."));
      } else {
        setError(messageOf(e, "Could not restore this project."));
      }
    } finally {
      setBusy(null);
    }
  }

  const slugReady = slugify(newSlug) !== "";

  const empty = projects.length === 0 && !searching;
  const retrySearch = () => {
    setListError(null);
    setRetry((n) => n + 1);
  };

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

      {listError ? (
        <ListError title="Couldn't load deleted projects" message={listError} onRetry={retrySearch} />
      ) : empty ? (
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
                  <TableHead>Restorable for</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {project.purge_at
                        ? (() => {
                            const left = daysLeft(project.purge_at);
                            return left === 1 ? "1 day" : `${left} days`;
                          })()
                        : "-"}
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

          <LoadMore
            next={next}
            loading={loadingMore}
            error={moreError}
            onLoadMore={() => void loadMore()}
          />
        </>
      )}

      <Dialog open={renaming !== null} onOpenChange={(v) => !v && !busy && setRenaming(null)}>
        <DialogContent className="p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming && slugReady) restore(renaming, slugify(newSlug));
            }}
          >
            <DialogTitle>Restore {renaming?.name} under a new slug</DialogTitle>
            <DialogDescription className="mt-1.5">
              Another project took{" "}
              <span className="font-mono text-foreground">{renaming?.slug}</span> while this one was
              deleted. Choose a new slug to restore it under; links to the old slug won&apos;t
              follow it.
            </DialogDescription>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="restore-project-slug">New slug</Label>
              <InputGroup
                id="restore-project-slug"
                prefix={`${slug}/`}
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                onBlur={() => setNewSlug((s) => slugify(s))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {dialogError && (
              <Alert variant="destructive" className="mt-4">
                {dialogError}
              </Alert>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(null)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!slugReady || busy !== null}>
                {busy ? "Restoring..." : "Restore project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
