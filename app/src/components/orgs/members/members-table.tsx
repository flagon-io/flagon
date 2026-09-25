"use client";

import { Lock, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@flagon-io/ui";
import type { Member } from "@/lib/api/types";
import { initials } from "@/lib/initials";
import { TableShell } from "@/components/shared/list-states";
import { MemberRoleSelect } from "./member-role-select";

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** What the viewer may do to members, shared by every row. */
export type MemberRowActions = {
  canManage: boolean;
  isOwner: boolean;
  currentUserId: string;
  isRemovable: (m: Member) => boolean;
  canLeaveSelf: boolean;
  leaveLockReason: string;
  onChangeRole: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
  onLeave: () => void;
};

export function MembersTable({
  rows,
  selected,
  allSelected,
  selectableCount,
  onToggleAll,
  onToggleOne,
  onRemoveSelected,
  actions,
}: {
  rows: Member[];
  selected: Set<string>;
  allSelected: boolean;
  selectableCount: number;
  onToggleAll: () => void;
  onToggleOne: (userId: string) => void;
  onRemoveSelected: () => void;
  actions: MemberRowActions;
}) {
  const { canManage } = actions;
  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow>
            {canManage && (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={allSelected}
                  disabled={selectableCount === 0}
                  onCheckedChange={onToggleAll}
                />
              </TableHead>
            )}
            {selected.size > 0 ? (
              <TableHead colSpan={4}>
                <div className="flex items-center gap-3">
                  <span className="text-foreground">{selected.size} selected</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onRemoveSelected}
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                </div>
              </TableHead>
            ) : (
              <>
                <TableHead>Member</TableHead>
                <TableHead className="hidden w-28 md:table-cell">Joined</TableHead>
                <TableHead className="w-36">Role</TableHead>
                <TableHead className="w-10" />
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              checked={selected.has(m.user_id)}
              onToggle={() => onToggleOne(m.user_id)}
              actions={actions}
            />
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}

function MemberRow({
  member: m,
  checked,
  onToggle,
  actions,
}: {
  member: Member;
  checked: boolean;
  onToggle: () => void;
  actions: MemberRowActions;
}) {
  const { canManage, isOwner, currentUserId, canLeaveSelf, leaveLockReason } = actions;
  const isSelf = m.user_id === currentUserId;
  const editable = actions.isRemovable(m);
  const display = m.name || m.username || m.email;

  return (
    <TableRow data-state={checked ? "selected" : undefined}>
      {canManage && (
        <TableCell>
          <Checkbox
            aria-label={`Select ${display}`}
            checked={checked}
            disabled={!editable}
            onCheckedChange={onToggle}
            className={cn(!editable && "invisible")}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 ring-1 ring-hairline">
            {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
            <AvatarFallback className="text-xs font-medium">{initials(m)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {display}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
        {formatJoined(m.joined_at)}
      </TableCell>
      <TableCell>
        {editable ? (
          <MemberRoleSelect
            value={m.role}
            onChange={(r) => actions.onChangeRole(m.user_id, r)}
            allowOwner={isOwner}
          />
        ) : (
          <Badge variant={m.role === "owner" ? "brand" : "outline"} className="capitalize">
            {m.role}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {(editable || isSelf) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${display}`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.email)}>
                Copy email address
              </DropdownMenuItem>
              {editable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => actions.onRemove(m.user_id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Remove from organization
                  </DropdownMenuItem>
                </>
              )}
              {isSelf && (
                <>
                  <DropdownMenuSeparator />
                  {canLeaveSelf ? (
                    <DropdownMenuItem
                      onClick={actions.onLeave}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="size-4" />
                      Leave organization
                    </DropdownMenuItem>
                  ) : (
                    <div title={leaveLockReason}>
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        <Lock className="size-3.5" />
                        Leave organization
                      </DropdownMenuItem>
                      <p className="px-2 pt-0.5 pb-1 text-xs text-muted-foreground/80">
                        {leaveLockReason} Transfer ownership first.
                      </p>
                    </div>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
