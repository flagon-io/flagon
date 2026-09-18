import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { PageHeader, PageBody } from "@/components/shell/page-header";

export default async function NewProjectPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer";
  // Viewers are read-only.
  if (role === "viewer") redirect(`/${slug}/projects`);

  return (
    <>
      <PageHeader
        title="New project"
        description="A deployable unit. You can add a repository and a README now, or later."
      />
      <PageBody>
        <NewProjectForm orgSlug={slug} />
      </PageBody>
    </>
  );
}
