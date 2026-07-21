import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { serializeTeam } from "@/lib/teams.server";
import { resolveTeamContext } from "./context";

/**
 * A single team.
 *
 *   GET    /api/v1/orgs/:slug/teams/:team_id -> the team
 *   DELETE /api/v1/orgs/:slug/teams/:team_id -> delete it (owners/admins);
 *          also removes any project access the team granted
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; team_id: string }> },
) {
  const { slug, team_id } = await params;
  const result = await resolveTeamContext(
    request,
    slug,
    team_id,
    "members:read",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiJson(serializeTeam(result.ctx.team));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; team_id: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, team_id } = await params;
  const result = await resolveTeamContext(
    request,
    slug,
    team_id,
    "members:write",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  try {
    await auth.api.removeTeam({
      body: { teamId: team_id, organizationId: result.ctx.org.id },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "delete_failed",
        error.body?.message ?? "Could not delete the team.",
      );
    }
    throw error;
  }
  return apiNoContent();
}
