import { notFound } from "next/navigation";
import { getTeam } from "@/lib/flagon-api";
import { getOrgContext } from "@/lib/org-context";
import { TeamDetail } from "@/components/teams/team-detail";
import { PageBody } from "@/components/shell/page-header";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ org: string; team: string }>;
}) {
  const { org: slug, team: teamSlug } = await params;

  const { me, role } = await getOrgContext(slug);

  const team = await getTeam(slug, teamSlug);
  if (!team) notFound();

  return (
    <PageBody>
      <TeamDetail
        slug={slug}
        teamSlug={team.slug}
        initialTeam={team}
        orgRole={role}
        currentUserId={me.user.id}
      />
    </PageBody>
  );
}
