/**
 * Org member role helpers: pure data + predicates, safe to import from BOTH
 * server and client components (deliberately NO `server-only` and NO database
 * import, so a client component can pull role labels without dragging the DB
 * client into the browser bundle). Mirrors the API's role model in
 * apps/api/src/lib/org-context.ts.
 */

const MANAGER_ROLES = new Set(["owner", "admin"]);
export function canManageOrg(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

// Org-wide read-only roles (mirrors the API's org-context enforcement): a viewer
// sees everything but changes nothing; billing is read-only outside billing.
const READ_ONLY_ROLES = new Set(["viewer", "billing"]);

/**
 * Whether a role may create/edit resources (flags, projects, teams, catalog).
 * The API is the real gate (resolveOrg refuses read-only writes); this just keeps
 * the console from offering controls that would 403.
 */
export function canWriteOrg(role: string): boolean {
  return !READ_ONLY_ROLES.has(role);
}

/**
 * Assignable org member roles (Vercel-style), for the members role picker. Owner
 * is deliberately absent — it is transferred, not assigned. Descriptions match
 * what each role can actually do given the API enforcement.
 */
export const ASSIGNABLE_ORG_ROLES: { value: string; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Manage the organization, members, and every project." },
  { value: "member", label: "Member", description: "Create and manage flags, projects, and the catalog." },
  { value: "viewer", label: "Viewer", description: "View projects and the catalog. Read-only." },
  { value: "billing", label: "Billing", description: "Manage billing and invoices. Read-only elsewhere." },
];

/** Human label for a member's stored role (includes owner, which isn't assignable). */
export function orgRoleLabel(role: string): string {
  if (role === "owner") return "Owner";
  return ASSIGNABLE_ORG_ROLES.find((r) => r.value === role)?.label ?? role;
}
