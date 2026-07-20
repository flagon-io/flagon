import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
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
async function resolveOrg(slug: string, headers: Headers) {
  try {
    return await auth.api.getFullOrganization({
      query: { organizationSlug: slug },
      headers,
    });
  } catch (error) {
    // Authorization failures are 404s (no existence leak); real errors surface.
    if (error instanceof APIError) return null;
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { slug } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const projects = await listProjects(org.id);
  return apiJson(projects.map(serializeProject));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { slug: orgSlug } = await params;
  const org = await resolveOrg(orgSlug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

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
