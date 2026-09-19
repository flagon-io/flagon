"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Alert, Badge, Button, Card, Skeleton } from "@flagon-io/ui";
import { authClient, useSession } from "@/lib/auth-client";

type Session = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  updatedAt: string | Date;
  createdAt: string | Date;
};

export function SessionsList() {
  const { data: current } = useSession();
  const currentToken = current?.session?.token;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: err } = await authClient.listSessions();
    if (err) setError(err.message ?? "Couldn't load your sessions.");
    else setSessions((data as Session[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function revoke(token: string) {
    setBusy(token);
    setError(null);
    const { error: err } = await authClient.revokeSession({ token });
    if (err) setError(err.message ?? "Couldn't revoke that session.");
    await refresh();
    setBusy(null);
  }

  async function revokeOthers() {
    setBusy("others");
    setError(null);
    const { error: err } = await authClient.revokeOtherSessions();
    if (err) setError(err.message ?? "Couldn't sign out other sessions.");
    await refresh();
    setBusy(null);
  }

  if (loading) {
    return (
      <Card className="divide-y divide-hairline">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  const others = sessions.filter((s) => s.token !== currentToken).length;

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <ul className="divide-y divide-hairline">
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken;
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Monitor className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {describeAgent(s.userAgent)}
                    {isCurrent && (
                      <Badge variant="brand" className="normal-case tracking-normal">
                        This device
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.ipAddress || "Unknown IP"} · Last active {formatWhen(s.updatedAt)}
                  </p>
                </div>
                {!isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revoke(s.token)}
                    disabled={busy !== null}
                  >
                    {busy === s.token ? "Revoking..." : "Revoke"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {sessions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {sessions.length} active {sessions.length === 1 ? "session" : "sessions"}
        </p>
      )}

      {others > 0 && (
        <Button variant="secondary" onClick={revokeOthers} disabled={busy !== null}>
          {busy === "others" ? "Signing out..." : "Sign out all other sessions"}
        </Button>
      )}
    </div>
  );
}

// Best-effort friendly device label from a User-Agent string.
function describeAgent(ua?: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function formatWhen(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "recently";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
