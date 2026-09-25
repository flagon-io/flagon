import { redirect, notFound } from "next/navigation";
import { getProject, projectCan } from "@/lib/flagon-api";
import { getOrgContext } from "@/lib/org-context";
import { ProjectAccessManager } from "@/components/projects/project-access-manager";
import { ProjectTeamsManager } from "@/components/projects/project-teams-manager";
import { ProjectOwnersManager } from "@/components/projects/project-owners-manager";

export default async function ProjectAccessPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const { me } = await getOrgContext(slug);
  const project = await getProject(slug, projectSlug);
  if (!project) notFound();
  // Settings (and so this page) is for people who can edit the project. The
  // managers gate add/change/remove on the caller's API-resolved project access:
  // collaborators and teams need project admin, owners need the owner tier.
  if (!projectCan(project, "project:write")) redirect(`/${slug}/projects/${projectSlug}`);
  const canAdmin = projectCan(project, "project:admin");
  const canOwn = projectCan(project, "project:own");

  return (
    <div className="space-y-10">
      <ProjectAccessManager
        slug={slug}
        project={project.slug}
        currentUserId={me.user.id}
        canManage={canAdmin}
      />

      <div className="border-t border-hairline" />

      <ProjectTeamsManager slug={slug} project={project.slug} canManage={canAdmin} />

      <div className="border-t border-hairline" />

      <ProjectOwnersManager slug={slug} project={project.slug} canManage={canOwn} />
    </div>
  );
}
