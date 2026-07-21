import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { members } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { isProjectRole, roleAtLeast } from "@/lib/project-access";
import {
  listProjectGrants,
  serializeGrant,
  upsertProjectGrant,
} from "@/lib/project-access.server";
import { resolveProjectContext } from "../context";

/**
 * Access grants on a project (repository-style access control).
 *
 *   GET  /api/v1/orgs/:slug/projects/:project/access -> list grants
 *   POST /api/v1/orgs/:slug/projects/:project/access -> create/update a
 *        grant: { user: "<username>" | team_id: "<id>", role } (admin only;
 *        idempotent per subject)
 *
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

  const grants = await listProjectGrants(
    result.ctx.org.id,
    result.ctx.project.id,
  );
  return apiJson(grants.map(serializeGrant));
}

export async function POST(
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
  const { ctx } = result;

  if (!roleAtLeast(ctx.role, "admin")) {
    return apiError(403, "forbidden", "Project admin access required.");
  }

  const body = await request.json().catch(() => null);
  const role = typeof body?.role === "string" ? body.role : "";
  const username = typeof body?.user === "string" ? body.user.trim() : "";
  const teamId = typeof body?.team_id === "string" ? body.team_id : "";

  if (!isProjectRole(role)) {
    return apiError(
      400,
      "invalid_role",
      "Role must be one of: read, write, admin.",
    );
  }
  if ((username && teamId) || (!username && !teamId)) {
    return apiError(
      400,
      "invalid_subject",
      "Provide exactly one of: user, team_id.",
    );
  }

  let subjectType: "user" | "team";
  let subjectId: string;
  if (username) {
    const [subject] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    // Membership is checked against the table rather than a session-loaded
    // org, so the check is identical whether a human or a token is calling.
    const membership = subject
      ? await db
          .select({ id: members.id })
          .from(members)
          .where(
            and(
              eq(members.organizationId, ctx.org.id),
              eq(members.userId, subject.id),
            ),
          )
          .limit(1)
      : [];
    if (!subject || !membership.length) {
      return apiError(
        422,
        "not_a_member",
        "That user is not a member of this organization.",
      );
    }
    subjectType = "user";
    subjectId = subject.id;
  } else {
    const teams = await auth.api.listOrganizationTeams({
      query: { organizationId: ctx.org.id },
      headers: request.headers,
    });
    if (!teams.some((team) => team.id === teamId)) {
      return apiError(
        422,
        "unknown_team",
        "That team does not exist in this organization.",
      );
    }
    subjectType = "team";
    subjectId = teamId;
  }

  const upserted = await upsertProjectGrant({
    orgId: ctx.org.id,
    projectId: ctx.project.id,
    subjectType,
    subjectId,
    role,
  });
  if (!upserted.ok) return apiError(400, upserted.code, upserted.error);

  const grants = await listProjectGrants(ctx.org.id, ctx.project.id);
  const grant = grants.find((g) => g.id === upserted.grant.id);
  return apiJson(grant ? serializeGrant(grant) : { id: upserted.grant.id }, {
    status: 201,
  });
}
