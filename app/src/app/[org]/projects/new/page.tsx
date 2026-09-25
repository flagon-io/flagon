import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { PageBody } from "@/components/shell/page-header";

export default async function NewProjectPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { role } = await getOrgContext(slug);
  // Viewers are read-only.
  if (role === "viewer") redirect(`/${slug}/projects`);

  return (
    <PageBody>
      <div className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A deployable unit. You can add a repository and a README now, or later.
        </p>
      </div>
      <NewProjectForm orgSlug={slug} />
    </PageBody>
  );
}
