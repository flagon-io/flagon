import {
  apiError,
  apiForbiddenOrigin,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { roleAtLeast } from "@/lib/project-access";
import { removeProjectGrant } from "@/lib/project-access.server";
import { resolveProjectContext } from "../../context";

/**
 * DELETE /api/v1/orgs/:slug/projects/:project/access/:grant_id -> revoke a
 * grant (admin only). Documented in src/lib/openapi.ts.
 */
export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ slug: string; project: string; grant_id: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, project, grant_id } = await params;
  const result = await resolveProjectContext(request, slug, project);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  const { ctx } = result;

  if (!roleAtLeast(ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  // Non-UUID ids can't exist; answer 404 without asking Postgres to cast.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(grant_id)) {
    return apiError(404, "not_found", "Grant not found.");
  }

  const removed = await removeProjectGrant(
    ctx.org.id,
    ctx.project.id,
    grant_id,
  );
  if (!removed) return apiError(404, "not_found", "Grant not found.");
  return apiNoContent();
}
