import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { TeamsList } from "@/components/teams/teams-list";
import { PageBody } from "@/components/shell/page-header";

export default async function TeamsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { role } = await getOrgContext(slug);
  const canManage = isOrgAdmin(role);

  return (
    <PageBody>
      <div className="mb-5 max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group members into teams, then grant a whole team access to a project at once. Owners and
          admins create teams; a team&rsquo;s maintainers manage who belongs to it.
        </p>
      </div>
      <TeamsList slug={slug} canManage={canManage} />
    </PageBody>
  );
}
