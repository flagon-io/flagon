import { apiError, apiJson } from "@/lib/api";
import { listTeamProjectGrants } from "@/lib/project-access.server";
import { resolveTeamContext } from "../context";

/**
 * GET /api/v1/orgs/:slug/teams/:team_id/projects -> the projects this team
 * holds an explicit access grant on, with the granted role. Documented in
 * src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; team_id: string }> },
) {
  const { slug, team_id } = await params;
  const result = await resolveTeamContext(request, slug, team_id);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const grants = await listTeamProjectGrants(result.ctx.org.id, team_id);
  return apiJson(
    grants.map((grant) => ({
      slug: grant.project.slug,
      name: grant.project.name,
      role: grant.role,
      granted_at: grant.createdAt.toISOString(),
    })),
  );
}
