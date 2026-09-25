"use client";

// Data plumbing shared by the project access managers (collaborators, teams,
// owners): load a keyset-paginated list, page in more, and reload after a
// mutation. A failed load surfaces as `loadError` (never as an empty list), and a
// failed "load more" as `moreError` without wiping the rows already shown.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Page, Team } from "@/lib/api/types";
import { errorMessage, fetchJson, messageOf } from "@/lib/client-fetch";

export type AccessList<T> = {
  items: T[];
  next: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
  moreError: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export function useAccessList<T>(url: string, fallback: string): AccessList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setMoreError(null);
    try {
      const d = await fetchJson<Page<T>>(url, undefined, fallback);
      setItems(d.items ?? []);
      setNext(d.next ?? null);
    } catch (e) {
      setLoadError(messageOf(e, fallback));
    } finally {
      setLoading(false);
    }
  }, [url, fallback]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const d = await fetchJson<Page<T>>(
        `${url}?cursor=${encodeURIComponent(next)}`,
        undefined,
        fallback,
      );
      setItems((prev) => [...prev, ...(d.items ?? [])]);
      setNext(d.next ?? null);
    } catch (e) {
      setMoreError(messageOf(e, fallback));
    } finally {
      setLoadingMore(false);
    }
  }, [url, next, fallback]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  return { items, next, loading, loadingMore, loadError, moreError, reload, loadMore };
}

/**
 * Sends a mutation to a route handler. Resolves to the user-facing error message
 * on failure, or null on success.
 */
export async function sendMutation(
  url: string,
  init: { method: "POST" | "PUT" | "DELETE"; body?: unknown },
  fallback: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: init.method,
      ...(init.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }),
    });
    return res.ok ? null : await errorMessage(res, fallback);
  } catch {
    return fallback;
  }
}

/**
 * A Combobox `loadOptions` source over the org's teams (server-side search),
 * excluding `exclude` slugs, so the team picker scales past a single page.
 */
export function useTeamOptions(slug: string, exclude: Iterable<string | null>) {
  const excluded = useMemo(() => new Set(exclude), [exclude]);
  return useCallback(
    async (query: string) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const d = await fetchJson<Page<Pick<Team, "name" | "slug">>>(
        `/api/orgs/${encodeURIComponent(slug)}/teams?${params.toString()}`,
      );
      return d.items
        .filter((t) => !excluded.has(t.slug))
        .map((t) => ({ value: t.slug, label: t.name }));
    },
    [slug, excluded],
  );
}
