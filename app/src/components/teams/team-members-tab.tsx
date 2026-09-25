"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import {
  Alert,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { TeamMember } from "@/lib/api/types";
import { errorMessage, messageOf } from "@/lib/client-fetch";
import { initials } from "@/lib/initials";
import { ListError, ListSkeleton, TableShell } from "@/components/shared/list-states";
import { AddTeamMemberDialog } from "./add-team-member-dialog";
import { EmptyState, LoadMoreButton, RoleSelect, RowMenu, TEAM_ROLE_OPTIONS } from "./team-shared";

export function TeamMembersTab({
  base,
  members,
  loading,
  loadError,
  onRetry,
  next,
  onLoadMore,
  canManage,
  currentUserId,
  reload,
}: {
  base: string;
  members: TeamMember[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  next: string | null;
  onLoadMore: () => Promise<void>;
  canManage: boolean;
  currentUserId: string;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await onLoadMore();
    } catch (e) {
      setError(messageOf(e, "Couldn't load more members."));
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.role !== b.role) return a.role === "maintainer" ? -1 : 1;
        return (a.name || a.email).localeCompare(b.name || b.email);
      }),
    [members],
  );

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(`${base}/members/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) setError(await errorMessage(res, "Couldn't change that role."));
    await reload();
  }

  async function remove(userId: string) {
    setError(null);
    const res = await fetch(`${base}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!res.ok) setError(await errorMessage(res, "Couldn't remove that member."));
    await reload();
  }

  const addButton = (
    <Button size="sm" onClick={() => setAddOpen(true)}>
      <Plus className="size-4" />
      Add member
    </Button>
  );

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : loadError
              ? ""
              : `${members.length} ${members.length === 1 ? "member" : "members"}`}
        </p>
        {canManage && addButton}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ListError title="Couldn't load members" message={loadError} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="size-5" />}
          title="No members yet"
          body="Add organization members to this team, then grant the team a role on a project."
          action={canManage ? addButton : null}
        />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="w-44">Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const isSelf = m.user_id === currentUserId;
                const display = m.name || m.username || m.email;
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 ring-1 ring-hairline">
                          {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                          <AvatarFallback className="text-xs font-medium">{initials(m)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {display}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <RoleSelect
                          roles={TEAM_ROLE_OPTIONS}
                          value={m.role}
                          onChange={(r) => changeRole(m.user_id, r)}
                        />
                      ) : (
                        <Badge variant={m.role === "maintainer" ? "brand" : "outline"} className="capitalize">
                          {m.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <RowMenu label={`Actions for ${display}`}>
                          <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.email)}>
                            Copy email address
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => remove(m.user_id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Remove from team
                          </DropdownMenuItem>
                        </RowMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
      )}

      {next && !loadError && <LoadMoreButton onClick={loadMore} loading={loadingMore} />}

      <AddTeamMemberDialog open={addOpen} onOpenChange={setAddOpen} base={base} onAdded={reload} />
    </div>
  );
}
