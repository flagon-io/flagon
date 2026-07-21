import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";
import {
  createProject,
  listProjects,
  serializeProject,
} from "@/lib/projects.server";

/**
 * Projects in an organization the authenticated user belongs to.
 *
 *   GET  /api/v1/orgs/:slug/projects               -> list
 *   POST /api/v1/orgs/:slug/projects {name, slug}  -> create
 *
 * Same lib helpers as the console pages. Documented in src/lib/openapi.ts;
 * keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "projects:read");
  if (!access.ok) return access.error;

  const projects = await listProjects(access.access.org.id);
  return apiJson(projects.map(serializeProject));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug: orgSlug } = await params;
  const access = await resolveOrgAccess(request, orgSlug, "projects:write");
  if (!access.ok) return access.error;
  const org = access.access.org;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!name || !slug) {
    return apiError(400, "invalid_project", "Provide name and slug.");
  }

  const result = await createProject(org.id, { name, slug });
  if (!result.ok) {
    const status = result.code === "slug_taken" ? 409 : 400;
    return apiError(status, result.code, result.error);
  }
  return apiJson(serializeProject(result.project), { status: 201 });
}
