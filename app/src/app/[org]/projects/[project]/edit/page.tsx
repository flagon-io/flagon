import { redirect, notFound } from "next/navigation";
import { getProject, projectCan } from "@/lib/flagon-api";
import { PageBody } from "@/components/shell/page-header";
import { ReadmeEditor } from "@/components/projects/readme-editor";

export default async function ProjectReadmeEditPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const project = await getProject(slug, projectSlug);
  if (!project) notFound();
  // Editing the README needs write on this project; read-only users get the view.
  if (!projectCan(project, "project:write")) redirect(`/${slug}/projects/${projectSlug}`);

  return (
    <PageBody className="max-w-4xl">
      <ReadmeEditor orgSlug={slug} project={project} />
    </PageBody>
  );
}
