// Shapes returned by the Go API, shared by the server gateway and the client
// components that render them. Client-safe: this module has no server imports,
// so "use client" files import types (and the role constants) from here, never
// from the server-only gateway modules.
//
// Every API shape is an alias of the schema GENERATED from the OpenAPI spec
// (schema.gen.ts, `npm run gen:api-types` / `make api-types`), so the app can't
// drift from the API: a renamed or removed field is a type error here. Where the
// spec types a field as a plain string but the app relies on its known values
// (roles, owner types), the alias narrows it; nothing else is hand-written.
import type { components } from "./schema.gen";

type S = components["schemas"];

// --- Lists ----------------------------------------------------------------

// ListOptions are the shared search + keyset-page params for any list call. They
// map to the API's ?q=&limit=&cursor= (and, for external clients, the HTTP QUERY
// body). cursor comes from a prior page's `next`.
export interface ListOptions {
  q?: string;
  cursor?: string;
  limit?: number;
}

// Page is one page of a list: the items plus the opaque cursor for the following
// page (null on the last page). The cursor is parsed from the API's RFC 5988 Link
// header, so this shape is identical for every paginated resource.
export interface Page<T> {
  items: T[];
  next: string | null;
}

// --- Me + orgs ------------------------------------------------------------

export type Org = S["Org"];

/** A soft-deleted org the caller owns, restorable until purge_at (deleted_at + 30 days). */
export type DeletedOrg = S["DeletedOrg"];

/** GET /me. The gateway normalizes a null org list to []. */
export type Me = Omit<S["MeOutputBody"], "orgs"> & { orgs: Org[] };

export type OrgSecurity = Omit<S["OrgSecurityOutputBody"], "$schema">;
export type BasePermission = OrgSecurity["base_permission"];

// --- AI agent -------------------------------------------------------------

export type AgentProposal = S["Proposal"];
export type AgentResult = S["Result"];
export type AgentMessage = S["AiChatMessage"];

// --- Projects -------------------------------------------------------------

export type Project = S["Project"];
export type CreateProjectBody = Omit<S["CreateProjectInputBody"], "$schema">;
// UpdateProjectBody is a partial edit: omitted fields are left unchanged.
export type UpdateProjectBody = Omit<S["UpdateProjectInputBody"], "$schema">;

/**
 * A capability the caller may hold on a project, as listed in the API's
 * `viewer.permissions` on a single-project read: view (read+), write (edit
 * metadata, write+), manage (settings and slug rename, maintain+), admin (manage
 * access, admin+), own (delete/restore and manage owners, owner tier).
 */
export type ProjectPermission =
  | "project:view"
  | "project:write"
  | "project:manage"
  | "project:admin"
  | "project:own";

/**
 * Whether the caller holds a permission on a project, from the API-resolved
 * `viewer` block (org role, base permission, direct and team grants, ownership).
 * Only decides which controls to show; the API re-checks every operation.
 */
export function projectCan(project: Project, permission: ProjectPermission): boolean {
  return project.viewer?.permissions?.includes(permission) ?? false;
}

/** Repository-style project roles, lowest to highest privilege. */
export const PROJECT_ROLES = ["read", "triage", "write", "maintain", "admin"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export type ProjectMember = S["ProjectMember"];
export type ProjectTeam = Omit<S["ProjectTeam"], "role"> & { role: ProjectRole };

export type OwnerType = "user" | "team";
export type ProjectOwner = Omit<S["ProjectOwner"], "owner_type"> & { owner_type: OwnerType };

// --- Audit ----------------------------------------------------------------

/** One org audit log entry (the API's audit.Event). */
export type AuditEvent = S["Event"];

/** An org's audit configuration. */
export type AuditConfig = Omit<S["AuditConfigOutputBody"], "$schema">;

// AuditQuery is the app's options for one audit page (search, filters, page
// size, and the keyset cursor from a prior page's `next`). It maps to the
// list-audit-log query string; AuditPage is that page plus its next cursor
// (read from the Link header), so both are client shapes, not API bodies.
export interface AuditQuery {
  q?: string;
  actions?: string[];
  actor?: string;
  perPage?: number;
  before?: string;
}

export interface AuditPage {
  events: AuditEvent[];
  next: string | null;
}

// --- Org members ----------------------------------------------------------

export type Member = S["Member"];

// --- Teams ----------------------------------------------------------------

/** A team's own membership role: maintainers manage the team, members belong. */
export const TEAM_ROLES = ["maintainer", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export type Team = S["Team"];
export type TeamMember = Omit<S["TeamMember"], "role"> & { role: TeamRole };
export type CreateTeamBody = Omit<S["CreateTeamInputBody"], "$schema">;
export type UpdateTeamBody = Omit<S["UpdateTeamInputBody"], "$schema">;

// TeamProject is a project a team has access to, with the granted role.
export type TeamProject = Omit<S["TeamProject"], "role"> & { role: ProjectRole };

// --- Invitations ----------------------------------------------------------

export type Invitation = S["Invitation"];

/** The public, pre-auth view of an invitation (looked up by token). */
export type InviteLookup = S["InviteLookup"];

/** Result of inviting: an existing user was added, or a pending invite created. */
export type InviteResult = Omit<S["InviteMemberOutputBody"], "status"> & {
  status: "added" | "invited";
};

export type AcceptedInvitation = Omit<S["AcceptInvitationOutputBody"], "$schema">;

// --- Access tokens (PAT + OAT) --------------------------------------------

export type AccessToken = S["AccessToken"];
/**
 * A token scope. Generated from the API's one scope list (AllScopes in
 * api/internal/server/scopes.go, published as the "Scope" enum), so UI keyed by
 * `Record<TokenScope, ...>` fails to type-check when a scope is missing.
 */
export type TokenScope = S["Scope"];
export type CreatedToken = Omit<S["CreateTokenOutputBody"], "$schema">;

/** Body for creating a PAT or OAT (`role` applies to org tokens only). */
export type CreateTokenBody = Omit<S["CreatePATInputBody"], "$schema"> & { role?: string };

// --- Notifications --------------------------------------------------------

export type Notification = S["Notification"];
