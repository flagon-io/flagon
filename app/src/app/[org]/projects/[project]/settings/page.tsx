import { redirect, notFound } from "next/navigation";
import { getProject, projectCan } from "@/lib/flagon-api";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const project = await getProject(slug, projectSlug);
  if (!project) notFound();
  // Editing needs write on this project; send read-only users back to the project.
  if (!projectCan(project, "project:write")) redirect(`/${slug}/projects/${projectSlug}`);

  return (
    <ProjectSettingsForm
      orgSlug={slug}
      project={project}
      canRename={projectCan(project, "project:manage")}
      canDelete={projectCan(project, "project:own")}
    />
  );
}
