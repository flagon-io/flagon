"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@flagon-io/ui";
import { type Notification, notificationMeta, timeAgo } from "@/lib/notifications";
import { NotificationDialog } from "@/components/notifications/notification-dialog";

type Filter = "all" | "unread";

export function NotificationsFeed() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)),
    );
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }, []);

  const markUnread = useCallback(async (id: string) => {
    setItems((prev) => prev.map((x) => (x.id === id && x.read_at ? { ...x, read_at: null } : x)));
    await fetch(`/api/notifications/${id}/unread`, { method: "POST" });
  }, []);

  // Opening a notification shows its detail and marks it read; the detail view
  // is where the user follows the link or flips it back to unread.
  function openItem(n: Notification) {
    setSelectedId(n.id);
    if (!n.read_at) void markRead(n.id);
  }

  function toggleRead(n: Notification) {
    if (n.read_at) void markUnread(n.id);
    else void markRead(n.id);
  }

  function navigate(n: Notification) {
    setSelectedId(null);
    if (n.link) router.push(n.link);
  }

  const selected = items.find((x) => x.id === selectedId) ?? null;

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  const unreadCount = useMemo(() => items.filter((x) => !x.read_at).length, [items]);
  const visible = useMemo(
    () => (filter === "unread" ? items.filter((x) => !x.read_at) : items),
    [items, filter],
  );

  if (loading) {
    return (
      <Card className="divide-y divide-hairline">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unreadCount > 0 && (
                <Badge variant="brand" className="ml-1.5">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={markAll} disabled={unreadCount === 0}>
          <CheckCheck className="size-4" />
          Mark all as read
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {visible.map((n) => (
              <FeedRow key={n.id} n={n} onOpen={openItem} onMarkRead={markRead} />
            ))}
          </ul>
        </Card>
      )}

      <NotificationDialog
        n={selected}
        open={selectedId !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
        onToggleRead={toggleRead}
        onNavigate={navigate}
      />
    </div>
  );
}

function FeedRow({
  n,
  onOpen,
  onMarkRead,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  onMarkRead: (id: string) => void;
}) {
  const { Icon, tone } = notificationMeta(n.type);
  const unread = !n.read_at;
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-panel focus-visible:bg-panel",
          unread && "bg-brand/5",
        )}
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone)}>
          <Icon className="size-4.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
          <span
            className={cn(
              "text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
            )}
          >
            {n.title}
          </span>
          {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
          <span className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
        </span>
      </button>
      {unread && (
        <>
          <span className="pointer-events-none absolute top-4 right-4 size-2 rounded-full bg-brand group-hover/row:opacity-0 group-focus-within/row:opacity-0" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMarkRead(n.id)}
            aria-label="Mark as read"
            title="Mark as read"
            className="absolute top-3 right-3 size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
          >
            <Check className="size-4" />
          </Button>
        </>
      )}
    </li>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Bell className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">
        {filter === "unread" ? "No unread notifications" : "No notifications yet"}
      </p>
      <p className="text-sm text-muted-foreground">
        {filter === "unread"
          ? "You're all caught up."
          : "Activity across your organizations will show up here."}
      </p>
    </Card>
  );
}
