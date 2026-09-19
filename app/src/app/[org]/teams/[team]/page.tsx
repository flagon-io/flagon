import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getTeam } from "@/lib/flagon-api";
import { TeamDetail } from "@/components/teams/team-detail";
import { PageBody } from "@/components/shell/page-header";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ org: string; team: string }>;
}) {
  const { org: slug, team: teamSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "member";

  const team = await getTeam(slug, teamSlug).catch(() => null);
  if (!team) notFound();

  return (
    <PageBody>
      <TeamDetail
        slug={slug}
        teamSlug={team.slug}
        initialTeam={team}
        orgRole={role}
        currentUserId={me?.user.id ?? ""}
      />
    </PageBody>
  );
}
