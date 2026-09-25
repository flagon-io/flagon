"use client";

import { Clock, Mail, MailPlus, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { Invitation } from "@/lib/api/types";
import { ListError, ListSkeleton, TableShell } from "@/components/shared/list-states";

// A friendly relative expiry ("expires in 6 days" / "expires today" / "expired").
function expiresLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

export function PendingInvites({
  invites,
  loading,
  error,
  onRetry,
  next,
  loadingMore,
  onLoadMore,
  canManage,
  onRevoke,
  onInvite,
}: {
  invites: Invitation[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  next: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  canManage: boolean;
  onRevoke: (id: string) => void;
  onInvite?: () => void;
}) {
  if (loading) {
    return <ListSkeleton />;
  }

  if (error) {
    return <ListError title="Couldn't load pending invitations" message={error} onRetry={onRetry} />;
  }

  if (invites.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <MailPlus className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">No pending invitations</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Invite someone by email and they&rsquo;ll show up here until they accept. People who
          don&rsquo;t have a Flagon account yet get a registration link.
        </p>
        {onInvite && (
          <Button size="sm" className="mt-1" onClick={onInvite}>
            <Plus className="size-4" />
            Invite people
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invitation</TableHead>
              <TableHead className="w-28">Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Clock className="size-3.5 shrink-0" />
                        {expiresLabel(inv.expires_at)}
                        {inv.inviter && <span className="truncate">&middot; invited by {inv.inviter}</span>}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {inv.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRevoke(inv.id)}
                      aria-label={`Revoke the invitation for ${inv.email}`}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {invites.length} pending {invites.length === 1 ? "invitation" : "invitations"}
        {next ? " loaded" : ""}
      </p>
    </div>
  );
}
