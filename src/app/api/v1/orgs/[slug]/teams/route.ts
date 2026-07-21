import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { teams } from "@/db/schema";
import { isOrgAdmin, resolveOrgAccess } from "@/lib/api-auth.server";
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
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "members:read");
  if (!access.ok) return access.error;

  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.organizationId, access.access.org.id))
    .orderBy(teams.createdAt);
  return apiJson(rows.map(serializeTeam));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "members:write");
  if (!access.ok) return access.error;
  if (!isOrgAdmin(access.access.actor)) {
    return apiError(
      403,
      "forbidden",
      "Organization administrators manage teams.",
    );
  }

  const body = await request.json().catch(() => null);
  const validation = validateTeamName(
    typeof body?.name === "string" ? body.name : "",
  );
  if (!validation.ok) {
    return apiError(400, "invalid_team_name", validation.error);
  }

  // Inserted directly rather than through the plugin helper, which requires a
  // session and so could never serve a token. The admin check above is the
  // same gate the plugin applies.
  try {
    const [team] = await db
      .insert(teams)
      .values({ name: validation.name, organizationId: access.access.org.id })
      .returning();
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
    throw error;
  }
}
