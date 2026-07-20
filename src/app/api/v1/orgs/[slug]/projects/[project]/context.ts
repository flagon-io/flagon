import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import type { ProjectRole } from "@/lib/project-access";
import { resolveProjectRole } from "@/lib/project-access.server";
import { getProject, type Project } from "@/lib/projects.server";

/**
 * Shared request context for the project-scoped v1 routes: authenticates,
 * membership-gates the org, loads the project, and resolves the caller's
 * effective role. Unknown orgs/projects and non-members all surface as 404
 * so private resources' existence never leaks.
 */
type FullOrganization = NonNullable<
  Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

export type ProjectContext = {
  org: FullOrganization;
  project: Project;
  userId: string;
  role: ProjectRole;
};

export type ProjectContextResult =
  | { ok: true; ctx: ProjectContext }
  | { ok: false; status: number; code: string; message: string };

export async function resolveProjectContext(
  request: Request,
  orgSlug: string,
  projectSlug: string,
): Promise<ProjectContextResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { ok: false, status: 401, code: "unauthorized", message: "Sign in required." };
  }

  let org: FullOrganization | null;
  try {
    org = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) org = null;
    else throw error;
  }
  if (!org) {
    return { ok: false, status: 404, code: "not_found", message: "Organization not found." };
  }

  const project = await getProject(org.id, projectSlug);
  if (!project) {
    return { ok: false, status: 404, code: "not_found", message: "Project not found." };
  }

  const role = await resolveProjectRole({
    orgId: org.id,
    projectId: project.id,
    userId: session.user.id,
    members: org.members,
  });
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Project not found." };
  }

  return { ok: true, ctx: { org, project, userId: session.user.id, role } };
}
