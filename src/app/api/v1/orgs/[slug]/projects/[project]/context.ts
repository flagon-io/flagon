import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members as membersTable } from "@/db/schema";
import type { TokenScope } from "@/lib/access-tokens.server";
import { resolveOrgAccess, type ApiActor } from "@/lib/api-auth.server";
import type { ProjectRole } from "@/lib/project-access";
import { resolveProjectRole } from "@/lib/project-access.server";
import { getProject, type Project } from "@/lib/projects.server";

/**
 * Shared request context for the project-scoped v1 routes: authenticates,
 * membership-gates the org, loads the project, and resolves the caller's
 * effective role. Unknown orgs/projects and callers who cannot see them all
 * surface as 404 so a private resource's existence never leaks.
 *
 * Works for sessions, personal tokens, and organization tokens alike; the
 * difference is where the project role comes from (see below).
 */
export type ProjectContext = {
  org: { id: string; slug: string; name: string; plan: string };
  project: Project;
  /** Null for an organization token, which has no user behind it. */
  userId: string | null;
  role: ProjectRole;
  actor: ApiActor;
};

export type ProjectContextResult =
  | { ok: true; ctx: ProjectContext }
  | { ok: false; status: number; code: string; message: string };

export async function resolveProjectContext(
  request: Request,
  orgSlug: string,
  projectSlug: string,
  scope: TokenScope,
): Promise<ProjectContextResult> {
  const access = await resolveOrgAccess(request, orgSlug, scope);
  if (!access.ok) {
    // The shared helper already produced the right status and body; unwrap it
    // back into this module's result shape so callers stay unchanged.
    const status = access.error.status;
    return {
      ok: false,
      status,
      code: status === 403 ? "insufficient_scope" : status === 401 ? "unauthorized" : "not_found",
      message:
        status === 403
          ? `This token is missing the ${scope} scope.`
          : status === 401
            ? "Sign in or provide an access token."
            : "Organization not found.",
    };
  }

  const { org, actor } = access.access;
  const project = await getProject(org.id, projectSlug);
  if (!project) {
    return { ok: false, status: 404, code: "not_found", message: "Project not found." };
  }

  // An organization token has no membership to resolve a project role from.
  // Its authority is its scopes, which resolveOrgAccess has already checked,
  // so it acts with project admin rights. A PERSONAL token does not: it
  // resolves the owner's real role, so it can never do more to a project than
  // the human behind it could.
  if (actor.kind === "org_token") {
    return { ok: true, ctx: { org, project, userId: null, role: "admin", actor } };
  }

  const orgMembers = await db
    .select({ userId: membersTable.userId, role: membersTable.role })
    .from(membersTable)
    .where(eq(membersTable.organizationId, org.id));

  const role = await resolveProjectRole({
    orgId: org.id,
    projectId: project.id,
    userId: actor.userId,
    members: orgMembers,
  });
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Project not found." };
  }

  return { ok: true, ctx: { org, project, userId: actor.userId, role, actor } };
}
