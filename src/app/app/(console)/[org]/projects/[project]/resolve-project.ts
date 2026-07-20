import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { ProjectRole } from "@/lib/project-access";
import { resolveProjectRole } from "@/lib/project-access.server";
import { getProject, type Project } from "@/lib/projects.server";
import { resolveOrg } from "../../resolve-org";

export type ProjectPageContext = {
  org: NonNullable<Awaited<ReturnType<typeof resolveOrg>>>;
  project: Project;
  role: ProjectRole;
  userId: string;
};

/**
 * Shared context for the project shell: org (membership-gated), project,
 * and the viewer's effective role. React-cached so the layout and the
 * active tab's page share one resolution per request. Null (-> notFound)
 * for unknown orgs/projects and non-members alike.
 */
export const resolveProjectContext = cache(
  async (
    orgSlug: string,
    projectSlug: string,
  ): Promise<ProjectPageContext | null> => {
    const [org, session] = await Promise.all([
      resolveOrg(orgSlug),
      auth.api.getSession({ headers: await headers() }),
    ]);
    if (!org || !session) return null;

    const project = await getProject(org.id, projectSlug);
    if (!project) return null;

    const role = await resolveProjectRole({
      orgId: org.id,
      projectId: project.id,
      userId: session.user.id,
      members: org.members,
    });
    if (!role) return null;

    return { org, project, role, userId: session.user.id };
  },
);
