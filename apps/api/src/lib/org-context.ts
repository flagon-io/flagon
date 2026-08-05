import type { Context } from "hono";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  members,
  orgSsoSessions,
  organizations,
  users,
} from "../db/auth-tables.js";
import type { AuthIdentity } from "./auth-context.js";
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

/**
 * The org's current plan (hobby | pro | enterprise), or the default when unknown.
 * organizations is an auth-layer table (no RLS), safe to read on the bare client.
 */
export async function orgPlan(orgId: string): Promise<string> {
  const row = (
    await db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
  )[0];
  return row?.plan ?? "hobby";
}

const MANAGER_ROLES = new Set(["owner", "admin"]);

// Read-only org roles: they can SEE everything in the org but change nothing.
// `viewer` is read-only everywhere; `billing` is read-only everywhere EXCEPT the
// billing endpoints, which opt back in via resolveOrg's `allowBillingWrite`.
// Enforcement is centralized in resolveOrg (the one gate every management
// handler funnels through), so a read-only role can never reach a write path —
// present or future — without every route having to remember to guard.
const READ_ONLY_ROLES = new Set(["viewer", "billing"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Whether a role may perform privileged actions (credentials, destructive deletes). */
export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

/** Whether a role is org-wide read-only (viewer/billing). */
export function isReadOnlyRole(role: string): boolean {
  return READ_ONLY_ROLES.has(role);
}

/**
 * Billing endpoints (checkout/portal): owners/admins, plus the dedicated
 * `billing` role. Everyone else — including read-only `viewer` — is refused.
 */
export function requireBillingManager(c: Context, ctx: OrgContext): Response | null {
  if (isManagerRole(ctx.role) || ctx.role === "billing") return null;
  return jsonError(
    c,
    403,
    "This action requires an owner, admin, or billing role in this organization.",
  );
}

/**
 * Gate a privileged mutation to owners/admins. Returns a 403 Response to
 * short-circuit when the caller's role is insufficient, or null to proceed.
 * Org tokens resolve to "owner" (see resolveOrg), so they always pass — a shared
 * org credential is minted by a manager and acts with the org's full authority.
 *
 * Apply AFTER resolveOrg to the handful of endpoints that mint/revoke client keys
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

/**
 * Refuse a WRITE (POST/PUT/PATCH/DELETE) from an org-wide read-only role. Reads
 * (GET) always pass. `billing` may write only where a route opts in with
 * `allowBillingWrite` (the billing endpoints). Returns a 403 Response to
 * short-circuit, or null to proceed.
 */
function enforceReadOnly(
  c: Context,
  role: string,
  opts: { allowBillingWrite?: boolean },
): Response | null {
  if (!WRITE_METHODS.has(c.req.method.toUpperCase())) return null;
  if (!READ_ONLY_ROLES.has(role)) return null;
  if (role === "billing" && opts.allowBillingWrite) return null;
  return jsonError(
    c,
    403,
    role === "billing"
      ? "Your billing role can only manage billing in this organization."
      : "Your role in this organization is read-only.",
  );
}

/**
 * Enforce an org's SSO / 2FA posture for a USER caller — a browser cookie OR a
 * personal access token. GitHub-style, a PAT rides on its owner's SSO session:
 * when an org enforces SSO, the token owner must hold an active SSO session for
 * that org (established once in the console, valid for the session TTL), and
 * must have 2FA when required. This closes the machine-token gap.
 *
 * ORGANIZATION tokens are exempt: they carry no user, so there is no identity to
 * hold an SSO session or 2FA — they are a deliberate org-service credential
 * minted by a manager. The OWNER is always exempt so an org can never lock
 * itself out. Returns a 403 Response when blocked, or null to proceed.
 */
async function enforceOrgSecurity(
  c: Context,
  auth: NonNullable<AuthIdentity>,
  org: { id: string; ssoEnforced: boolean; require2fa: boolean },
  role: string,
): Promise<Response | null> {
  // Only USER identities (cookie session or personal token) are gated; an org
  // token has no user to authenticate interactively.
  if (auth.kind !== "user") return null;
  if (role === "owner") return null;

  if (org.ssoEnforced) {
    const active = (
      await db
        .select({ id: orgSsoSessions.id })
        .from(orgSsoSessions)
        .where(
          and(
            eq(orgSsoSessions.organizationId, org.id),
            eq(orgSsoSessions.userId, auth.user.id),
            gt(orgSsoSessions.expiresAt, new Date()),
          ),
        )
        .limit(1)
    )[0];
    if (!active) {
      return jsonError(
        c,
        403,
        "This organization requires single sign-on. Authenticate through the console, then retry.",
      );
    }
  }

  if (org.require2fa) {
    const u = (
      await db
        .select({ twoFactorEnabled: users.twoFactorEnabled })
        .from(users)
        .where(eq(users.id, auth.user.id))
        .limit(1)
    )[0];
    if (!u?.twoFactorEnabled) {
      return jsonError(
        c,
        403,
        "This organization requires two-factor authentication. Enable it in the console, then retry.",
      );
    }
  }

  return null;
}

export async function resolveOrg(
  c: Context,
  opts: { allowLocked?: boolean; allowBillingWrite?: boolean } = {},
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
        ssoEnforced: organizations.ssoEnforced,
        require2fa: organizations.require2fa,
      })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
  )[0];
  // Authorize BEFORE revealing anything about the org. A caller who isn't
  // authorized for THIS org gets a uniform 404 — whether the org doesn't exist,
  // or exists but they aren't a member — so an outsider can't probe slug
  // existence, membership, or an org's subscription/lock state from the status
  // code. Existence and lock state are only ever observable to a real member.
  let role: string;
  let actorUserId: string | null;
  if (auth.kind === "organization") {
    if (!org || auth.organization.id !== org.id) {
      return jsonError(c, 404, "Organization not found.");
    }
    role = "owner";
    actorUserId = null;
  } else {
    const membership = org
      ? (
          await db
            .select({ role: members.role })
            .from(members)
            .where(
              and(eq(members.organizationId, org.id), eq(members.userId, auth.user.id)),
            )
            .limit(1)
        )[0]
      : undefined;
    if (!org || !membership) {
      return jsonError(c, 404, "Organization not found.");
    }
    role = membership.role;
    actorUserId = auth.user.id;
  }

  // SSO / 2FA enforcement (GitHub-style) for USER callers — a browser cookie or
  // a personal token, which rides on its owner's SSO session. A non-owner member
  // of an sso_enforced org needs an active SSO session (established in the
  // console), and of a require_2fa org needs 2FA enrolled. Organization tokens
  // (no user) are exempt; the owner is never gated.
  const security = await enforceOrgSecurity(c, auth, org, role);
  if (security) return security;

  // The caller is an authorized member of a real org. Only now do the lock +
  // read-only gates apply: a locked (lapsed/unpaid) org refuses its own members
  // the management surface with a reactivation pointer, and a viewer/billing
  // role can never reach a write handler. `allowLocked` is the billing exception
  // so a lapsed org can still reactivate.
  if (!opts.allowLocked && isOrgLocked(org)) {
    return jsonError(
      c,
      403,
      "This organization's subscription is inactive. Reactivate it in the console to continue.",
    );
  }
  const readOnly = enforceReadOnly(c, role, opts);
  if (readOnly) return readOnly;

  return {
    orgId: org.id,
    orgSlug: org.slug,
    role,
    actorUserId,
    projectCreationPolicy: org.projectCreationPolicy,
  };
}
