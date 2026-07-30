import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { members, organizations } from "../db/auth-tables.js";
import { getAuth } from "./auth-context.js";
import { isOrgLocked } from "./entitlement.js";
import { jsonError } from "./http.js";

/**
 * Resolve and AUTHORIZE the organization a management request targets (the
 * `:org` slug in the path) for the already-resolved auth identity. Returns the
 * org context, or a Response to short-circuit the request (401/403/404).
 *
 * Everything downstream then runs inside withOrg(orgId), so the database itself
 * (RLS) enforces the boundary — this check is the authorization layer on top.
 *
 * Two ways to be authorized for an org:
 *   - an organization token issued for exactly this org, or
 *   - a user (personal token or session cookie) who is a member of it.
 *
 * These reads hit auth-layer tables (organizations, members), which have no RLS
 * and are safe to query before any org context exists.
 */
export type OrgContext = {
  orgId: string;
  orgSlug: string;
  /** Member role, or "owner" for an org token. Actor user id for the audit log. */
  role: string;
  actorUserId: string | null;
  /** Org base permission for project creation ('managers' | 'members'). */
  projectCreationPolicy: string;
};

/**
 * Resolve an org slug to its id with no authorization — for callers that have
 * ALREADY authorized the request and just need the id (e.g. cache invalidation
 * after a mutation). Returns null if the slug is unknown.
 */
export async function orgIdBySlug(slug: string): Promise<string | null> {
  const row = (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
  )[0];
  return row?.id ?? null;
}

const MANAGER_ROLES = new Set(["owner", "admin"]);

/** Whether a role may perform privileged actions (credentials, destructive deletes). */
export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

/**
 * Gate a privileged mutation to owners/admins. Returns a 403 Response to
 * short-circuit when the caller's role is insufficient, or null to proceed.
 * Org tokens resolve to "owner" (see resolveOrg), so they always pass — a shared
 * org credential is minted by a manager and acts with the org's full authority.
 *
 * Apply AFTER resolveOrg to the handful of endpoints that mint/revoke SDK keys
 * or hard-delete a resource; ordinary member reads/writes stay ungated.
 */
export function requireManager(c: Context, ctx: OrgContext): Response | null {
  if (!isManagerRole(ctx.role)) {
    return jsonError(
      c,
      403,
      "This action requires an owner or admin role in this organization.",
    );
  }
  return null;
}

/**
 * Gate project creation to the org's base permission (GitHub-style). Owners and
 * admins may always create; ordinary members may only when the org has opened
 * creation up ('members'). Returns a 403 Response to short-circuit, or null.
 */
export function requireProjectCreator(c: Context, ctx: OrgContext): Response | null {
  if (isManagerRole(ctx.role)) return null;
  if (ctx.projectCreationPolicy === "members") return null;
  return jsonError(
    c,
    403,
    "Only owners and admins can create projects in this organization.",
  );
}

export async function resolveOrg(
  c: Context,
  opts: { allowLocked?: boolean } = {},
): Promise<OrgContext | Response> {
  const slug = c.req.param("org");
  if (!slug) return jsonError(c, 400, "Missing organization in the path.");

  const auth = getAuth(c);
  if (!auth) {
    return jsonError(
      c,
      401,
      "Authentication required. Send a Bearer access token or a valid session cookie.",
    );
  }

  const org = (
    await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        plan: organizations.plan,
        subscriptionStatus: organizations.subscriptionStatus,
        projectCreationPolicy: organizations.projectCreationPolicy,
      })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
  )[0];
  if (!org) return jsonError(c, 404, "Organization not found.");

  // A locked (lapsed/unpaid) Pro org is refused the whole management surface —
  // for org tokens and members alike — so the lock cannot be bypassed via the
  // API. `allowLocked` is the single exception, for the billing endpoints: a
  // locked org must still be able to reactivate. The SDK/OFREP path is
  // unaffected (a locked org that never paid was never issued an SDK key).
  if (!opts.allowLocked && isOrgLocked(org)) {
    return jsonError(
      c,
      403,
      "This organization's subscription is inactive. Reactivate it in the console to continue.",
    );
  }

  if (auth.kind === "organization") {
    if (auth.organization.id !== org.id) {
      return jsonError(
        c,
        403,
        "This token is not authorized for that organization.",
      );
    }
    return {
      orgId: org.id,
      orgSlug: org.slug,
      role: "owner",
      actorUserId: null,
      projectCreationPolicy: org.projectCreationPolicy,
    };
  }

  const membership = (
    await db
      .select({ role: members.role })
      .from(members)
      .where(
        and(eq(members.organizationId, org.id), eq(members.userId, auth.user.id)),
      )
      .limit(1)
  )[0];
  if (!membership) {
    return jsonError(c, 403, "You are not a member of that organization.");
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    role: membership.role,
    actorUserId: auth.user.id,
    projectCreationPolicy: org.projectCreationPolicy,
  };
}
