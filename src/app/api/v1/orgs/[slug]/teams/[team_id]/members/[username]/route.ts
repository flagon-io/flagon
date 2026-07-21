import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { members } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { resolveTeamContext } from "../../context";

/**
 * Team membership for a single user, addressed by username.
 *
 *   PUT    /api/v1/orgs/:slug/teams/:team_id/members/:username -> add
 *          (idempotent; the user must already be an organization member)
 *   DELETE /api/v1/orgs/:slug/teams/:team_id/members/:username -> remove
 *
 * The organization plugin enforces permissions (owners/admins manage team
 * rosters). Documented in src/lib/openapi.ts; keep the two in sync.
 */
async function findUser(username: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ slug: string; team_id: string; username: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, team_id, username } = await params;
  const result = await resolveTeamContext(request, slug, team_id, "members:write");
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const user = await findUser(username);
  // Checked against the table so tokens and sessions resolve identically.
  const membership = user
    ? await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.organizationId, result.ctx.org.id), eq(members.userId, user.id)))
        .limit(1)
    : [];
  if (!user || !membership.length) {
    return apiError(
      422,
      "not_a_member",
      "That user is not a member of this organization.",
    );
  }

  try {
    await auth.api.addTeamMember({
      body: {
        teamId: team_id,
        userId: user.id,
        organizationId: result.ctx.org.id,
      },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      // Already on the team reads as success: PUT is idempotent.
      const message = error.body?.message?.toLowerCase() ?? "";
      if (message.includes("already")) return apiNoContent();
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "add_failed",
        error.body?.message ?? "Could not add them to the team.",
      );
    }
    throw error;
  }
  return apiNoContent();
}

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ slug: string; team_id: string; username: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, team_id, username } = await params;
  const result = await resolveTeamContext(request, slug, team_id, "members:write");
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const user = await findUser(username);
  if (!user) return apiError(404, "not_found", "Member not found.");

  try {
    await auth.api.removeTeamMember({
      body: {
        teamId: team_id,
        userId: user.id,
        organizationId: result.ctx.org.id,
      },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "remove_failed",
        error.body?.message ?? "Could not remove them from the team.",
      );
    }
    throw error;
  }
  return apiNoContent();
}
