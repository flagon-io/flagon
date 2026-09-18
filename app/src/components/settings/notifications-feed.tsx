"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Skeleton, cn } from "@flagon-io/ui";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsFeed() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/notifications?limit=50");
    if (res.ok) {
      const d = await res.json();
      setItems(d.notifications ?? []);
    } else {
      setError("Couldn't load your notifications. Try refreshing the page.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function openItem(n: Notification) {
    if (!n.read_at) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)),
      );
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }

  const hasUnread = items.some((x) => !x.read_at);

  if (loading) {
    return (
      <Card className="divide-y divide-hairline">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}
      {hasUnread && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll}>
            Mark all as read
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        error ? null : (
          <Card className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
          </Card>
        )
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left outline-none transition-colors hover:bg-panel focus-visible:bg-panel",
                    !n.read_at && "bg-brand/5",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {!n.read_at && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
                    {n.title}
                  </span>
                  {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
                  <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
