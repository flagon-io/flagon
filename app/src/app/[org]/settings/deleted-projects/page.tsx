import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, listDeletedProjects } from "@/lib/flagon-api";
import { DeletedProjectsList } from "@/components/projects/deleted-projects-list";
import { PageBody } from "@/components/shell/page-header";

export default async function DeletedProjectsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "member";
  // The archive is an administrative view (like the audit log): owners and admins.
  if (role !== "owner" && role !== "admin") redirect(`/${slug}/settings`);

  const projects = (await listDeletedProjects(slug)).items;

  return (
    <PageBody>
      <div className="mb-5 max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Deleted projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting a project is reversible. Deleted projects are kept here so you can restore one
          with its settings and access intact. Restoring is available while the project&rsquo;s slug
          has not been reused by a live project.
        </p>
      </div>
      <DeletedProjectsList slug={slug} initial={projects} />
    </PageBody>
  );
}
