import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations } from "@/db/schema";
import { apiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import {
  authenticateToken,
  satisfiesScope,
  type TokenScope,
} from "@/lib/access-tokens.server";

/**
 * One authorization path for the whole v1 API, whoever is calling.
 *
 * Three kinds of caller reach these routes and they are NOT interchangeable:
 *
 *   session  - a signed-in human in the console. Authority is their org role.
 *
 *   PAT      - a personal access token. Acts AS its owner, so its authority is
 *              the intersection of that person's role and the token's scopes.
 *              It can never exceed what the human could do by hand, and it
 *              dies when their membership does. Requires
 *              X-Flagon-Organization, because a personal token belongs to a
 *              person, not to any one organization.
 *
 *   org token - minted by an owner or admin and belonging to the organization
 *              itself. There is no human behind it and no role to intersect
 *              with, so its authority IS its scopes. This is the deliberate
 *              trade that replaces service accounts: no fake member, no seat,
 *              and it survives the person who created it leaving.
 *
 * Every route states the scope it needs. Sessions ignore scopes (a human is
 * bounded by their role instead); tokens are bounded by both.
 */

export type OrgRole = "owner" | "admin" | "member";

export type ApiActor =
  | { kind: "session"; userId: string; role: OrgRole }
  | {
      kind: "pat";
      userId: string;
      role: OrgRole;
      scopes: readonly string[];
      tokenId: string;
    }
  | { kind: "org_token"; scopes: readonly string[]; tokenId: string };

export type OrgAccess = {
  actor: ApiActor;
  org: { id: string; slug: string; name: string; plan: string };
};

export type OrgAccessResult =
  | { ok: true; access: OrgAccess }
  | { ok: false; error: Response };

/**
 * Whether the actor may perform an administrative action.
 *
 * For humans and personal tokens this is the org role, so a plain member
 * cannot escalate by minting themselves a token with a broad scope. For an
 * organization token there is no role, and its scopes already say what it may
 * do: it was created by an admin precisely so automation would not need one.
 */
export function isOrgAdmin(actor: ApiActor): boolean {
  if (actor.kind === "org_token") return true;
  return actor.role === "owner" || actor.role === "admin";
}

/** The user behind the call, or null for an organization token. */
export function actorUserId(actor: ApiActor): string | null {
  return actor.kind === "org_token" ? null : actor.userId;
}

/**
 * Authenticates and authorizes a request against one organization.
 *
 * Unknown organizations and organizations the caller cannot see both return
 * 404, so a private slug's existence never leaks. A valid credential that
 * merely lacks the scope returns 403 with the missing scope named, because
 * "unauthorized" for a scope problem sends people hunting for the wrong bug.
 */
export async function resolveOrgAccess(
  request: Request,
  slug: string,
  requiredScope: TokenScope,
): Promise<OrgAccessResult> {
  const notFound = {
    ok: false as const,
    error: apiError(404, "not_found", "Organization not found."),
  };

  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      plan: organizations.plan,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  const token = await authenticateToken(request.headers.get("authorization"));

  if (token) {
    if (!satisfiesScope(token.scopes, requiredScope)) {
      return {
        ok: false,
        error: apiError(
          403,
          "insufficient_scope",
          `This token is missing the ${requiredScope} scope.`,
        ),
      };
    }
    if (!org) return notFound;

    if (token.subjectType === "organization") {
      // An org token is bound to exactly one organization. Pointing it at
      // another must look identical to that organization not existing.
      if (token.subjectId !== org.id) return notFound;
      return {
        ok: true,
        access: {
          org,
          actor: { kind: "org_token", scopes: token.scopes, tokenId: token.id },
        },
      };
    }

    // Personal token: it may only reach organizations its owner belongs to,
    // and it inherits their role rather than the token's own authority.
    const role = await memberRole(org.id, token.subjectId);
    if (!role) return notFound;
    return {
      ok: true,
      access: {
        org,
        actor: {
          kind: "pat",
          userId: token.subjectId,
          role,
          scopes: token.scopes,
          tokenId: token.id,
        },
      },
    };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      ok: false,
      error: apiError(401, "unauthorized", "Sign in or provide an access token."),
    };
  }
  if (!org) return notFound;

  const role = await memberRole(org.id, session.user.id);
  if (!role) return notFound;
  return {
    ok: true,
    access: {
      org,
      actor: { kind: "session", userId: session.user.id, role },
    },
  };
}

/**
 * Authenticates a request that is NOT organization-scoped (the /v1/user
 * surface). Organization tokens are refused: they have no user behind them, so
 * "the current user" is a question they cannot answer.
 */
export async function resolveUserAccess(
  request: Request,
  requiredScope: TokenScope | null,
): Promise<
  { ok: true; userId: string; actor: ApiActor } | { ok: false; error: Response }
> {
  const token = await authenticateToken(request.headers.get("authorization"));
  if (token) {
    if (token.subjectType === "organization") {
      return {
        ok: false,
        error: apiError(
          403,
          "forbidden",
          "Organization tokens cannot act on a user account.",
        ),
      };
    }
    if (requiredScope && !satisfiesScope(token.scopes, requiredScope)) {
      return {
        ok: false,
        error: apiError(
          403,
          "insufficient_scope",
          `This token is missing the ${requiredScope} scope.`,
        ),
      };
    }
    return {
      ok: true,
      userId: token.subjectId,
      // No org context here, so there is no role to carry. Routes on this
      // surface are about the caller's own account.
      actor: {
        kind: "pat",
        userId: token.subjectId,
        role: "member",
        scopes: token.scopes,
        tokenId: token.id,
      },
    };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      ok: false,
      error: apiError(401, "unauthorized", "Sign in or provide an access token."),
    };
  }
  return {
    ok: true,
    userId: session.user.id,
    actor: { kind: "session", userId: session.user.id, role: "member" },
  };
}

/**
 * Requires a session specifically, refusing every token.
 *
 * For operations a credential must never be able to perform on its own:
 * minting or revoking tokens above all. If a token could do this, a leak would
 * be unrecoverable, because the holder would issue a replacement before the
 * one you noticed was revoked.
 */
export async function requireSession(
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; error: Response }> {
  if (request.headers.get("authorization")?.startsWith("Bearer flagon_")) {
    return {
      ok: false,
      error: apiError(
        403,
        "session_required",
        "Access tokens cannot manage access tokens. Sign in to do this.",
      ),
    };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { ok: false, error: apiError(401, "unauthorized", "Sign in required.") };
  }
  return { ok: true, userId: session.user.id };
}

async function memberRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, orgId), eq(members.userId, userId)))
    .limit(1);
  if (!row) return null;
  return row.role === "owner" || row.role === "admin" ? row.role : "member";
}
