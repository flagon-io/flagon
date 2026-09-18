"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Skeleton, buttonClasses, cn } from "@flagon-io/ui";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCount = useCallback(async () => {
    const res = await fetch("/api/notifications/unread-count");
    if (res.ok) {
      const d = await res.json();
      setUnread(d.count ?? 0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications?limit=15");
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
    const t = setInterval(() => {
      void loadCount();
    }, 60000);
    return () => clearInterval(t);
  }, [loadCount]);

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) void loadList();
  }

  async function openItem(n: Notification) {
    if (!n.read_at) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(buttonClasses({ variant: "ghost", size: "icon" }), "relative")}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="text-xs font-medium text-link outline-none hover:underline focus-visible:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-hairline">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-1.5 px-3 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&rsquo;re all caught up.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-hairline px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-panel focus-visible:bg-panel",
                  !n.read_at && "bg-brand/5",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {!n.read_at && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
                  <span className="truncate">{n.title}</span>
                </span>
                {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
              </button>
            ))
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
