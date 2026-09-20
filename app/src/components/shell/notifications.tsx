"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton, buttonClasses, cn } from "@flagon-io/ui";
import { type Notification, notificationMeta, timeAgo } from "@/lib/notifications";
import { NotificationDialog } from "@/components/notifications/notification-dialog";

export function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadCount = useCallback(async () => {
    const res = await fetch("/api/notifications/unread-count");
    if (res.ok) {
      const d = await res.json();
      setUnread(d.count ?? 0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications?limit=10");
    if (res.ok) {
      const d = await res.json();
      setItems(d.notifications ?? []);
    }
    setLoading(false);
  }, []);

  // Initial unread count + a light poll so the badge stays roughly fresh.
  useEffect(() => {
    (async () => {
      await loadCount();
    })();
    const t = setInterval(() => void loadCount(), 60000);
    return () => clearInterval(t);
  }, [loadCount]);

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) void loadList();
  }

  // markRead flips one notification to read (optimistically) without navigating.
  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)),
    );
    setUnread((u) => Math.max(0, u - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }, []);

  // markUnread returns one notification to the unread feed (optimistically).
  const markUnread = useCallback(async (id: string) => {
    setItems((prev) => prev.map((x) => (x.id === id && x.read_at ? { ...x, read_at: null } : x)));
    setUnread((u) => u + 1);
    await fetch(`/api/notifications/${id}/unread`, { method: "POST" });
  }, []);

  // Opening a notification shows its detail (never a surprise navigation) and
  // marks it read, since reading it is exactly what just happened.
  function openItem(n: Notification) {
    setSelectedId(n.id);
    setOpen(false);
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
    setUnread(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <>
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          buttonClasses({ variant: "outline", size: "sm", className: "aspect-square px-0" }),
          "relative",
        )}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            Notifications
            {unread > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{unread} unread</span>}
          </span>
          {unread > 0 && (
            <Button
              type="button"
              variant="link"
              onClick={markAll}
              className="h-auto gap-1 p-0 text-xs font-medium"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-104 overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-hairline">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 px-3 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-hairline">
              {items.map((n) => (
                <NotificationRow key={n.id} n={n} onOpen={openItem} onMarkRead={markRead} />
              ))}
            </ul>
          )}
        </div>

        <Link
          href="/settings/notifications"
          onClick={() => setOpen(false)}
          className="block border-t border-hairline px-3 py-2 text-center text-xs font-medium text-link outline-none hover:underline focus-visible:underline"
        >
          View all
        </Link>
      </PopoverContent>
    </Popover>

      <NotificationDialog
        n={selected}
        open={selectedId !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
        onToggleRead={toggleRead}
        onNavigate={navigate}
      />
    </>
  );
}

function NotificationRow({
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
          "flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-panel focus-visible:bg-panel",
          unread && "bg-brand/5",
        )}
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
            )}
          >
            {n.title}
          </span>
          {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
          <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
        </span>
      </button>
      {/* Unread dot, swapped for a "mark read" button on hover/focus. */}
      {unread && (
        <>
          <span className="pointer-events-none absolute top-1/2 right-3 size-2 -translate-y-1/2 rounded-full bg-brand group-hover/row:opacity-0 group-focus-within/row:opacity-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMarkRead(n.id)}
            aria-label="Mark as read"
            title="Mark as read"
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
          >
            <Check className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Bell className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">You&rsquo;re all caught up</p>
      <p className="text-xs text-muted-foreground">New notifications will show up here.</p>
    </div>
  );
}
