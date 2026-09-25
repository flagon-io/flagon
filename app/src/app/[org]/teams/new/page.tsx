import { redirect } from "next/navigation";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { NewTeamForm } from "@/components/teams/new-team-form";
import { PageBody } from "@/components/shell/page-header";

export default async function NewTeamPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { role } = await getOrgContext(slug);
  // Only owners and admins create teams.
  if (!isOrgAdmin(role)) redirect(`/${slug}/teams`);

  return (
    <PageBody>
      <div className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">New team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A named group of members. Grant it a role on a project and everyone on the team gets that
          access.
        </p>
      </div>
      <NewTeamForm orgSlug={slug} />
    </PageBody>
  );
}
