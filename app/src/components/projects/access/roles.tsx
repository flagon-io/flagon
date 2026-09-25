"use client";

// The repository-style project role ladder (read < triage < write < maintain <
// admin) as the access managers present it: labels, one-line hints, a picker,
// a read-only badge, and a highest-first sort. Mirrors the API's ladder and its
// effective = max(org, grant) rule.
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flagon-io/ui";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/api/types";

const LABELS: Record<ProjectRole, string> = {
  admin: "Admin",
  maintain: "Maintain",
  write: "Write",
  triage: "Triage",
  read: "Read",
};

const HINTS: Record<ProjectRole, string> = {
  admin: "Full control, including deleting the project and managing access.",
  maintain: "Write, plus manage project settings.",
  write: "Edit the project's name, README, and settings metadata.",
  triage: "Read, plus manage the project's work items.",
  read: "View the project and its collaborators.",
};

/** Roles highest privilege first, for display. */
export const ROLE_OPTIONS: { value: ProjectRole; label: string; hint: string }[] = [...PROJECT_ROLES]
  .reverse()
  .map((value) => ({ value, label: LABELS[value], hint: HINTS[value] }));

/** The default role for a new grant. */
export const DEFAULT_ROLE: ProjectRole = "write";

export function roleHint(role: string): string | undefined {
  return ROLE_OPTIONS.find((r) => r.value === role)?.hint;
}

function rank(role: string): number {
  return PROJECT_ROLES.indexOf(role as ProjectRole) + 1;
}

/** A copy of `rows` sorted highest role first. */
export function sortByRole<T extends { role: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => rank(b.role) - rank(a.role));
}

export function RoleSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (role: string) => void;
}) {
  // The per-row selector is compact (sm); the one in the add dialog sits with
  // other md fields, so it takes the default height.
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size={id ? "md" : "sm"} className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A role that the viewer can't change. */
export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "admin" ? "brand" : "outline"} className="capitalize">
      {role}
    </Badge>
  );
}

/** A role picker cell: editable select when allowed, otherwise a badge. */
export function RoleCell({
  role,
  editable,
  onChange,
}: {
  role: string;
  editable: boolean;
  onChange: (role: string) => void;
}) {
  return editable ? <RoleSelect value={role} onChange={onChange} /> : <RoleBadge role={role} />;
}
