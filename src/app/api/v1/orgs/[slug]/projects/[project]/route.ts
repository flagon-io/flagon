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
  renameProject,
  serializeProject,
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
  const result = await resolveProjectContext(request, slug, project);
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
  const result = await resolveProjectContext(request, slug, project);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  if (!roleAtLeast(result.ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return apiError(400, "invalid_name", "Provide a name.");
  }

  const renamed = await renameProject(
    result.ctx.org.id,
    result.ctx.project.id,
    name,
  );
  if (!renamed.ok) return apiError(400, renamed.code, renamed.error);
  return apiJson({
    ...serializeProject(renamed.project),
    role: result.ctx.role,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, project } = await params;
  const result = await resolveProjectContext(request, slug, project);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  if (!roleAtLeast(result.ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  const removed = await deleteProject(result.ctx.org.id, result.ctx.project.id);
  if (!removed) return apiError(404, "not_found", "Project not found.");
  return apiNoContent();
}
