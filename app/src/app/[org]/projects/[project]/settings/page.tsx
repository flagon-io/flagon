import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getProject } from "@/lib/flagon-api";
import { PageBody } from "@/components/shell/page-header";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Editing needs write access; send viewers back to the read-only project page.
  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer";
  if (role === "viewer") redirect(`/${slug}/projects/${projectSlug}`);

  const project = await getProject(slug, projectSlug).catch(() => null);
  if (!project) notFound();

  return (
    <PageBody>
      <ProjectSettingsForm orgSlug={slug} project={project} />
    </PageBody>
  );
}
