import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, listProjects } from "@/lib/flagon-api";
import { PageBody } from "@/components/shell/page-header";
import { ProjectsBrowser } from "@/components/projects/projects-browser";

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer";
  const canCreate = role !== "viewer";
  const projects = await listProjects(slug).catch(() => []);

  return (
    <PageBody>
      <ProjectsBrowser projects={projects} orgSlug={slug} canCreate={canCreate} />
    </PageBody>
  );
}
