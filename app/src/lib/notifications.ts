import {
  Bell,
  Building2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

// Notification is the client-side shape returned by the /api/notifications*
// gateway routes (mirrors db.Notification). Kept standalone so client components
// never import the server-only flagon-api module.
export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// notificationMeta maps a notification type to an icon and a tone, so the feed
// reads at a glance the way GitHub's does. Unknown types fall back to a bell.
type NotificationMeta = { Icon: LucideIcon; tone: string };

// Tones reuse the same palette classes as the design system's Badge variants
// (there are no --success/--warning theme tokens; Badge uses raw emerald/amber).
const META: Record<string, NotificationMeta> = {
  "org.created": { Icon: Building2, tone: "bg-brand/12 text-brand-bright" },
  "org.member_added": {
    Icon: UserPlus,
    tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
  "org.invite_accepted": {
    Icon: UserPlus,
    tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
  "org.role_changed": {
    Icon: ShieldCheck,
    tone: "bg-amber-500/14 text-amber-600 dark:text-amber-400",
  },
  "org.member_removed": { Icon: UserMinus, tone: "bg-destructive/12 text-destructive" },
};

export function notificationMeta(type: string): NotificationMeta {
  return META[type] ?? { Icon: Bell, tone: "bg-secondary text-muted-foreground" };
}

// timeAgo renders a compact relative time ("just now", "5m", "3h", "2d") and
// falls back to a locale date past 30 days. Shared by the bell and the feed.
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}
