/**
 * Catalog vocabulary — the fixed option sets the console renders for a project's
 * metadata and access. Mirrors the enums the API validates (projects.route.ts).
 * Kept in one place so the pickers and the read-only display stay in lockstep.
 */
export type Option = { value: string; label: string };
export type RoleOption = { value: string; label: string; description: string };

export const LIFECYCLES: Option[] = [
  { value: "planning", label: "Planning" },
  { value: "in_development", label: "In development" },
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "ga", label: "GA" },
  { value: "deprecated", label: "Deprecated" },
];

export const TIERS: Option[] = [
  { value: "1", label: "Tier 1 · Critical" },
  { value: "2", label: "Tier 2 · Important" },
  { value: "3", label: "Tier 3 · Standard" },
  { value: "4", label: "Tier 4 · Low" },
];

/**
 * Project access levels, GitHub-repository style. A team granted access to a
 * project holds one of these. The project's owning team is always an implicit
 * admin and isn't listed as a grant.
 */
export const PROJECT_ACCESS_ROLES: RoleOption[] = [
  { value: "read", label: "Read", description: "View the project and its catalog entry." },
  { value: "triage", label: "Triage", description: "Read, plus manage its status and metadata." },
  { value: "write", label: "Write", description: "Contribute to and configure the project." },
  { value: "maintain", label: "Maintain", description: "Manage the project, short of destructive actions." },
  { value: "admin", label: "Admin", description: "Full access, including access and deletion." },
];

/** Human label for a stored value, falling back to the raw value. */
export function labelFor(options: Option[], value: string | null): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Human label for an access role. */
export function accessRoleLabel(value: string): string {
  return PROJECT_ACCESS_ROLES.find((r) => r.value === value)?.label ?? value;
}
