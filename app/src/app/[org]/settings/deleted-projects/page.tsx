import { redirect } from "next/navigation";
import { listDeletedProjects } from "@/lib/flagon-api";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { DeletedProjectsList } from "@/components/projects/deleted-projects-list";
import { PageBody } from "@/components/shell/page-header";

export default async function DeletedProjectsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  const { role } = await getOrgContext(slug);
  // The archive is an administrative view (like the audit log): owners and admins.
  if (!isOrgAdmin(role)) redirect(`/${slug}/settings`);

  const projects = (await listDeletedProjects(slug)).items;

  return (
    <PageBody>
      <div className="mb-5 max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Deleted projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting a project is reversible for 30 days. Deleted projects are kept here so you can
          restore one with its settings and access intact. If another project has taken its slug
          meanwhile, you restore it under a new one.
        </p>
      </div>
      <DeletedProjectsList slug={slug} initial={projects} />
    </PageBody>
  );
}
