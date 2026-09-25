"use client";

// Small pieces shared by the team detail tabs and dialogs: the role option lists
// (labels + hints), the role picker, the row action menu, and the empty state.
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flagon-io/ui";
import { PROJECT_ROLES, type ProjectRole, type TeamRole } from "@/lib/api/types";

export type RoleOption<R extends string = string> = { value: R; label: string; hint: string };

// A team's own membership roles, highest privilege first.
export const TEAM_ROLE_OPTIONS: RoleOption<TeamRole>[] = [
  { value: "maintainer", label: "Maintainer", hint: "Manage the team's members and edit the team." },
  { value: "member", label: "Member", hint: "Belong to the team and its project grants." },
];

// Repository-style roles a team can hold on a project, highest privilege first.
export const PROJECT_ROLE_OPTIONS: RoleOption<ProjectRole>[] = [
  { value: "admin", label: "Admin", hint: "Full control, including managing access." },
  { value: "maintain", label: "Maintain", hint: "Write, plus manage project settings." },
  { value: "write", label: "Write", hint: "Edit the project's metadata and README." },
  { value: "triage", label: "Triage", hint: "Read, plus manage the project's work items." },
  { value: "read", label: "Read", hint: "View the project." },
];

/** Privilege rank of a project role (PROJECT_ROLES is lowest first); 0 if unknown. */
export function projectRoleRank(role: string): number {
  return (PROJECT_ROLES as readonly string[]).indexOf(role) + 1;
}

export function RoleSelect({
  id,
  roles,
  value,
  onChange,
}: {
  id?: string;
  roles: { value: string; label: string }[];
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size={id ? "md" : "sm"} className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </Card>
  );
}

/** "Load more" under a paginated list. */
export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex justify-center">
      <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
        {loading ? "Loading..." : "Load more"}
      </Button>
    </div>
  );
}
