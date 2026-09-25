"use client";

import { useCallback, useEffect, useState } from "react";
import type { Page } from "@/lib/api/types";
import { fetchJson, messageOf } from "@/lib/client-fetch";

/**
 * One keyset-paginated list from an app route (`url` answers `Page<T>`). A failed
 * load is an `error` (never an empty list); `reload` refreshes page 1 in place,
 * `retry` does the same behind the loading skeleton, and `loadMore` throws on
 * failure so the caller can say why.
 */
export function usePagedList<T>(url: string, fallback: string) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchJson<Page<T>>(url, undefined, fallback);
      setItems(data.items ?? []);
      setNext(data.next ?? null);
      setError(null);
    } catch (e) {
      setError(messageOf(e, fallback));
    } finally {
      setLoading(false);
    }
  }, [url, fallback]);

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    await reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    const data = await fetchJson<Page<T>>(
      `${url}?cursor=${encodeURIComponent(next)}`,
      undefined,
      fallback,
    );
    setItems((prev) => [...prev, ...(data.items ?? [])]);
    setNext(data.next ?? null);
  }, [url, fallback, next]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  return { items, next, loading, error, reload, retry, loadMore };
}
