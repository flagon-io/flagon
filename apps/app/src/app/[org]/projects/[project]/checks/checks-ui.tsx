/** Shared, pure UI helpers for checks (status colors, formatting). */

export const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  up: { label: "Up", dot: "bg-emerald-500", text: "text-emerald-400" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-400" },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-400" },
  paused: { label: "Paused", dot: "bg-zinc-500", text: "text-zinc-400" },
  unknown: { label: "Pending", dot: "bg-zinc-600", text: "text-zinc-400" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.unknown;
}

export const TYPE_LABELS: Record<string, string> = {
  http: "HTTP",
  keyword: "Keyword",
  tls_expiry: "TLS expiry",
  tcp: "TCP",
  heartbeat: "Heartbeat",
};

export function intervalLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
