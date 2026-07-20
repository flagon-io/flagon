import { APIError } from "better-auth/api";
import { isUniqueViolation } from "@/db/errors";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { validateTeamName } from "@/lib/teams";
import { serializeTeam } from "@/lib/teams.server";

/**
 * Teams in an organization the authenticated user belongs to.
 *
 *   GET  /api/v1/orgs/:slug/teams         -> list
 *   POST /api/v1/orgs/:slug/teams {name}  -> create (owners/admins)
 *
 * Creation goes through auth.api so the organization plugin's permission
 * checks apply - the same enforcement the console gets. Documented in
 * src/lib/openapi.ts; keep the two in sync.
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

  const teams = await auth.api.listOrganizationTeams({
    query: { organizationId: org.id },
    headers: request.headers,
  });
  return apiJson(teams.map(serializeTeam));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { slug } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const body = await request.json().catch(() => null);
  const validation = validateTeamName(
    typeof body?.name === "string" ? body.name : "",
  );
  if (!validation.ok) {
    return apiError(400, "invalid_team_name", validation.error);
  }

  try {
    const team = await auth.api.createTeam({
      body: { name: validation.name, organizationId: org.id },
      headers: request.headers,
    });
    return apiJson(serializeTeam(team), { status: 201 });
  } catch (error) {
    // Unique violation on (organization_id, lower(name)).
    if (isUniqueViolation(error)) {
      return apiError(
        409,
        "team_already_exists",
        "A team with that name already exists in this organization.",
      );
    }
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "create_failed",
        error.body?.message ?? "Could not create the team.",
      );
    }
    throw error;
  }
}
