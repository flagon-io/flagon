import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { roleAtLeast } from "@/lib/project-access";
import {
  changeProjectSlug,
  deleteProject,
  getProject,
  renameProject,
  serializeProject,
  updateProjectDetails,
  updateProjectOverview,
} from "@/lib/projects.server";
import { resolveProjectContext } from "./context";

/**
 * A single project.
 *
 *   GET    /api/v1/orgs/:slug/projects/:project -> the project + your role
 *   PATCH  /api/v1/orgs/:slug/projects/:project -> name and slug (admin),
 *          description/website/topics/overview_markdown (write). Omitted
 *          fields are left alone; changing the slug moves the resource and
 *          leaves NO redirect at the old path.
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
  const result = await resolveProjectContext(
    request,
    slug,
    project,
    "projects:read",
  );
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
  const result = await resolveProjectContext(
    request,
    slug,
    project,
    "projects:write",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  const body = await request.json().catch(() => null);
  const detailKeys = ["description", "website", "topics"] as const;
  const hasDetails =
    !!body &&
    detailKeys.some((key) => body[key] !== undefined && body[key] !== null);
  if (
    !body ||
    (typeof body.name !== "string" &&
      typeof body.slug !== "string" &&
      typeof body.overview_markdown !== "string" &&
      !hasDetails)
  )
    return apiError(
      400,
      "invalid_update",
      "Provide name, slug, description, website, topics, or overview_markdown.",
    );
  if (typeof body.slug === "string") {
    if (!roleAtLeast(result.ctx.role, "admin"))
      return apiError(
        403,
        "forbidden",
        "Project admin access required to change a project slug.",
      );
    // No redirect is left behind: the old path 404s from here on. See
    // changeProjectSlug for why that is the deliberate failure mode.
    const moved = await changeProjectSlug(
      result.ctx.org.id,
      result.ctx.project.id,
      body.slug,
    );
    if (!moved.ok)
      return apiError(
        moved.code === "slug_taken" ? 409 : 400,
        moved.code,
        moved.error,
      );
    result.ctx.project = moved.project;
  }
  if (hasDetails) {
    if (!roleAtLeast(result.ctx.role, "write"))
      return apiError(
        403,
        "forbidden",
        "Project write access required to edit project details.",
      );
    // PATCH semantics: an omitted field keeps its stored value, rather than
    // being cleared by a caller who only meant to set one of the three.
    const updated = await updateProjectDetails(
      result.ctx.org.id,
      result.ctx.project.id,
      {
        description:
          typeof body.description === "string"
            ? body.description
            : result.ctx.project.description,
        website:
          typeof body.website === "string"
            ? body.website
            : result.ctx.project.website,
        topics:
          body.topics === undefined || body.topics === null
            ? result.ctx.project.topics
            : Array.isArray(body.topics)
              ? body.topics.map((topic: unknown) => String(topic))
              : String(body.topics),
      },
    );
    if (!updated.ok) return apiError(400, updated.code, updated.error);
  }
  if (typeof body.name === "string") {
    if (!roleAtLeast(result.ctx.role, "admin"))
      return apiError(
        403,
        "forbidden",
        "Project admin access required to rename a project.",
      );
    const renamed = await renameProject(
      result.ctx.org.id,
      result.ctx.project.id,
      body.name,
    );
    if (!renamed.ok) return apiError(400, renamed.code, renamed.error);
  }
  if (typeof body.overview_markdown === "string") {
    if (!roleAtLeast(result.ctx.role, "write"))
      return apiError(
        403,
        "forbidden",
        "Project write access required to edit the overview.",
      );
    const updated = await updateProjectOverview(
      result.ctx.org.id,
      result.ctx.project.id,
      body.overview_markdown,
    );
    if (!updated.ok) return apiError(400, updated.code, updated.error);
  }
  const projectResult = await getProject(
    result.ctx.org.id,
    result.ctx.project.slug,
  );
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
  const result = await resolveProjectContext(
    request,
    slug,
    project,
    "projects:write",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  if (!roleAtLeast(result.ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  const removed = await deleteProject(result.ctx.org.id, result.ctx.project.id);
  if (!removed) return apiError(404, "not_found", "Project not found.");
  return apiNoContent();
}
