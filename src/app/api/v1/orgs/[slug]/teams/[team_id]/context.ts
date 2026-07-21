import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams as teamsTable } from "@/db/schema";
import type { TokenScope } from "@/lib/access-tokens.server";
import { resolveOrgAccess, type ApiActor } from "@/lib/api-auth.server";

/**
 * Shared request context for team-scoped v1 routes: authenticates,
 * membership-gates the org, and verifies the team belongs to it. Unknown
 * orgs/teams and callers who cannot see them all surface as 404 so private
 * resources' existence never leaks.
 *
 * Teams are read straight from the table rather than through the plugin's
 * session-bound helper, so a token and a human resolve identically.
 */
export type TeamContext = {
  org: { id: string; slug: string; name: string; plan: string };
  team: { id: string; name: string; createdAt: Date; updatedAt?: Date | null };
  /** Null for an organization token, which has no user behind it. */
  userId: string | null;
  actor: ApiActor;
};

export type TeamContextResult =
  | { ok: true; ctx: TeamContext }
  | { ok: false; status: number; code: string; message: string };

export async function resolveTeamContext(
  request: Request,
  orgSlug: string,
  teamId: string,
  scope: TokenScope,
): Promise<TeamContextResult> {
  const access = await resolveOrgAccess(request, orgSlug, scope);
  if (!access.ok) {
    const status = access.error.status;
    return {
      ok: false,
      status,
      code: status === 403 ? "insufficient_scope" : status === 401 ? "unauthorized" : "not_found",
      message:
        status === 403
          ? `This token is missing the ${scope} scope.`
          : status === 401
            ? "Sign in or provide an access token."
            : "Organization not found.",
    };
  }

  const { org, actor } = access.access;
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.organizationId, org.id), eq(teamsTable.id, teamId)))
    .limit(1);
  if (!team) {
    return { ok: false, status: 404, code: "not_found", message: "Team not found." };
  }

  return {
    ok: true,
    ctx: {
      org,
      team,
      userId: actor.kind === "org_token" ? null : actor.userId,
      actor,
    },
  };
}
