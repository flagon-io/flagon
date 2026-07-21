import { apiError, apiJson } from "@/lib/api";
import { listTeamProjects } from "@/lib/project-access.server";
import { resolveTeamContext } from "../context";

/**
 * GET /api/v1/orgs/:slug/teams/:team_id/projects -> every project this team is
 * attached to, by access grant or by catalog ownership. `role` is null for a
 * project the team owns without holding a grant, which is exactly the state a
 * grants-only list used to hide. Documented in src/lib/openapi.ts; keep the
 * two in sync.
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
    "projects:read",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const entries = await listTeamProjects(result.ctx.org.id, team_id);
  return apiJson(
    entries.map((entry) => ({
      slug: entry.project.slug,
      name: entry.project.name,
      role: entry.role,
      owner: entry.owner,
      granted_at: entry.grantedAt?.toISOString() ?? null,
    })),
  );
}
