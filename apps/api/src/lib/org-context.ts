import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { members, organizations } from "../db/auth-tables.js";
import { getAuth } from "./auth-context.js";
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
};

export async function resolveOrg(c: Context): Promise<OrgContext | Response> {
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
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
  )[0];
  if (!org) return jsonError(c, 404, "Organization not found.");

  if (auth.kind === "organization") {
    if (auth.organization.id !== org.id) {
      return jsonError(
        c,
        403,
        "This token is not authorized for that organization.",
      );
    }
    return { orgId: org.id, orgSlug: org.slug, role: "owner", actorUserId: null };
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
  };
}
