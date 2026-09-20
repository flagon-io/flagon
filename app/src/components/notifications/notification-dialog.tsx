"use client";

import { usePathname } from "next/navigation";
import { ArrowUpRight, Check, Undo2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
} from "@flagon-io/ui";
import {
  type Notification,
  notificationActionLabel,
  notificationMeta,
  timeAgo,
} from "@/lib/notifications";

/**
 * Detail view for a single notification. Opening a notification lands here
 * instead of navigating away, so a click is never a surprise jump: from here the
 * user reads the full message, flips it read/unread, and only follows the link
 * when they choose to. `read_at` is surfaced so it's clear when it was read.
 */
export function NotificationDialog({
  n,
  open,
  onOpenChange,
  onToggleRead,
  onNavigate,
}: {
  n: Notification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleRead: (n: Notification) => void;
  onNavigate: (n: Notification) => void;
}) {
  const pathname = usePathname();
  if (!n) return null;
  const { Icon, tone } = notificationMeta(n.type);
  const unread = !n.read_at;
  // Only offer "Open" when it actually takes you somewhere new - not to the page
  // you're already on (that's the no-op that made a click feel pointless).
  const canOpen = Boolean(n.link) && n.link !== pathname;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(30rem,92vw)] p-0">
        <div className="flex items-start gap-3 p-5">
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
              tone,
            )}
          >
            <Icon className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-base font-semibold text-foreground">{n.title}</DialogTitle>
            {n.body && (
              <DialogDescription className="text-sm text-muted-foreground">
                {n.body}
              </DialogDescription>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Received {timeAgo(n.created_at)}
              {n.read_at && <> &middot; Read {timeAgo(n.read_at)}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onToggleRead(n)}>
            {unread ? <Check className="size-4" /> : <Undo2 className="size-4" />}
            {unread ? "Mark as read" : "Mark as unread"}
          </Button>
          {canOpen && (
            <Button size="sm" onClick={() => onNavigate(n)}>
              {notificationActionLabel(n.type)}
              <ArrowUpRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
