import { listProjects } from "@/lib/flagon-api";
import { getOrgContext } from "@/lib/org-context";
import { PageBody } from "@/components/shell/page-header";
import { ProjectsBrowser } from "@/components/projects/projects-browser";

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { role } = await getOrgContext(slug);
  const canCreate = role !== "viewer";
  const first = await listProjects(slug);

  return (
    <PageBody>
      <ProjectsBrowser
        initialProjects={first.items}
        initialNext={first.next}
        orgSlug={slug}
        canCreate={canCreate}
      />
    </PageBody>
  );
}
