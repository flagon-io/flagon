"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Plus } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Skeleton,
} from "@flagon-io/ui";

type Token = {
  id: string;
  name: string;
  prefix: string;
  role: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

const SCOPE_LABELS: Record<string, string> = {
  "read:user": "Read profile",
  user: "Manage profile",
  "admin:user": "Account admin",
  "read:org": "Read orgs",
  "write:org": "Manage members",
  "admin:org": "Org admin",
  "read:project": "Read projects",
  "write:project": "Manage projects",
  notifications: "Notifications",
};

export function TokensList({
  basePath,
  newHref,
  canManage = true,
}: {
  basePath: string;
  newHref: string;
  canManage?: boolean;
}) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Token | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(basePath);
    if (res.ok) {
      const d = await res.json();
      setTokens(d.tokens ?? []);
    } else {
      setError("Couldn't load your tokens. Try refreshing the page.");
    }
    setLoading(false);
  }, [basePath]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function revoke() {
    if (!revoking) return;
    const res = await fetch(`${basePath}/${revoking.id}`, { method: "DELETE" });
    setRevoking(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't revoke the token.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={newHref}>
              <Plus className="size-4" />
              Generate new token
            </Link>
          </Button>
        </div>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <Card className="divide-y divide-hairline">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 px-4 py-3.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </Card>
      ) : tokens.length === 0 ? (
        error ? null : (
          <Card className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          </Card>
        )
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <KeyRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {t.name}
                    {t.role && (
                      <Badge variant="outline" className="capitalize">
                        {t.role}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{t.prefix}…</span> · {scopeText(t)} · {usage(t)}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setRevoking(t)}
                    className="rounded-md px-2 py-1 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!loading && tokens.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {tokens.length} {tokens.length === 1 ? "token" : "tokens"}
        </p>
      )}

      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent className="p-6">
          <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
          <DialogDescription className="mt-1.5">
            Any client using this token will immediately lose access. This can&rsquo;t be undone.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={revoke}>
              Revoke token
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function scopeText(t: Token): string {
  if (t.scopes === null) return "Full access";
  if (t.scopes.length === 0) return "No scopes";
  return t.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ");
}

function usage(t: Token): string {
  const last = t.last_used_at ? `used ${rel(t.last_used_at)}` : "never used";
  const exp = t.expires_at ? `expires ${new Date(t.expires_at).toLocaleDateString()}` : "no expiry";
  return `${last} · ${exp}`;
}

function rel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
