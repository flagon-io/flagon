import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { roleAtLeast } from "@/lib/project-access";
import {
  deleteProject,
  getProject,
  renameProject,
  serializeProject,
  updateProjectOverview,
} from "@/lib/projects.server";
import { resolveProjectContext } from "./context";

/**
 * A single project.
 *
 *   GET    /api/v1/orgs/:slug/projects/:project -> the project + your role
 *   PATCH  /api/v1/orgs/:slug/projects/:project {name} -> rename (admin)
 *   DELETE /api/v1/orgs/:slug/projects/:project -> delete (admin); access
 *          grants go with it
 *
 * Unknown slugs and projects the caller cannot see both return 404.
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await params;
  const result = await resolveProjectContext(request, slug, project, "projects:read");
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return apiJson({
    ...serializeProject(result.ctx.project),
    role: result.ctx.role,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, project } = await params;
  const result = await resolveProjectContext(request, slug, project, "projects:write");
  if (!result.ok) return apiError(result.status, result.code, result.message);
  const body = await request.json().catch(() => null);
  if (!body || (typeof body.name !== "string" && typeof body.overview_markdown !== "string")) return apiError(400, "invalid_update", "Provide name or overview_markdown.");
  if (typeof body.name === "string") {
    if (!roleAtLeast(result.ctx.role, "admin")) return apiError(403, "forbidden", "Project admin access required to rename a project.");
    const renamed = await renameProject(result.ctx.org.id, result.ctx.project.id, body.name);
    if (!renamed.ok) return apiError(400, renamed.code, renamed.error);
  }
  if (typeof body.overview_markdown === "string") {
    if (!roleAtLeast(result.ctx.role, "write")) return apiError(403, "forbidden", "Project write access required to edit the overview.");
    const updated = await updateProjectOverview(result.ctx.org.id, result.ctx.project.id, body.overview_markdown);
    if (!updated.ok) return apiError(400, updated.code, updated.error);
  }
  const projectResult = await getProject(result.ctx.org.id, result.ctx.project.slug);
  return apiJson({
    ...serializeProject(projectResult ?? result.ctx.project),
    role: result.ctx.role,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, project } = await params;
  const result = await resolveProjectContext(request, slug, project, "projects:write");
  if (!result.ok) return apiError(result.status, result.code, result.message);
  if (!roleAtLeast(result.ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  const removed = await deleteProject(result.ctx.org.id, result.ctx.project.id);
  if (!removed) return apiError(404, "not_found", "Project not found.");
  return apiNoContent();
}
