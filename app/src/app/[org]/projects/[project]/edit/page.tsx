import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getProject } from "@/lib/flagon-api";
import { PageBody } from "@/components/shell/page-header";
import { ReadmeEditor } from "@/components/projects/readme-editor";

export default async function ProjectReadmeEditPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Editing the README needs write access; viewers get the read-only view.
  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer";
  if (role === "viewer") redirect(`/${slug}/projects/${projectSlug}`);

  const project = await getProject(slug, projectSlug).catch(() => null);
  if (!project) notFound();

  return (
    <PageBody className="max-w-4xl">
      <ReadmeEditor orgSlug={slug} project={project} />
    </PageBody>
  );
}
