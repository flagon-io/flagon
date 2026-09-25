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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { AccessToken, TokenScope } from "@/lib/api/types";
import { errorMessage, fetchJson, messageOf } from "@/lib/client-fetch";
import { ListError, ListSkeleton, TableShell } from "@/components/shared/list-states";

type Token = AccessToken;

// Short labels for every scope the API accepts; a Record over the generated
// TokenScope type, so a new API scope without a label is a type error.
const SCOPE_LABELS: Record<TokenScope, string> = {
  "read:user": "Read profile",
  user: "Manage profile",
  "admin:user": "Account admin",
  "read:org": "Read orgs",
  "write:org": "Manage members",
  "admin:org": "Org admin",
  "read:project": "Read projects",
  "write:project": "Manage projects",
  "admin:project": "Project admin",
  "read:team": "Read teams",
  "write:team": "Manage teams",
  "admin:team": "Team admin",
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Token | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await fetchJson<{ tokens?: Token[] }>(basePath, undefined, "Couldn't load your tokens.");
      setTokens(d.tokens ?? []);
    } catch (e) {
      setLoadError(messageOf(e, "Couldn't load your tokens."));
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
      setError(await errorMessage(res, "Couldn't revoke the token."));
      return;
    }
    setError(null);
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
        <ListSkeleton />
      ) : loadError ? (
        <ListError title="Couldn't load tokens" message={loadError} onRetry={load} />
      ) : tokens.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        </Card>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Token</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                {canManage && (
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <KeyRound className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          {t.name}
                          {t.role && (
                            <Badge variant="outline" className="capitalize">
                              {t.role}
                            </Badge>
                          )}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{t.prefix}…</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={scopeText(t)}>
                    {scopeText(t)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {t.last_used_at ? rel(t.last_used_at) : "Never"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "No expiry"}
                  </TableCell>
                  {canManage && (
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevoking(t)}
                        className="text-destructive hover:text-destructive"
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}

      {!loading && !loadError && tokens.length > 0 && (
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
  return t.scopes.map((s) => SCOPE_LABELS[s as TokenScope] ?? s).join(", ");
}

function rel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
