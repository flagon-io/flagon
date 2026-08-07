import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getOrgMembers } from "@/lib/org";
import { getTeam, listTeamMembers } from "@/lib/teams-api";
import { listProjects } from "@/lib/projects-api";
import { TeamHeader } from "./team-header";
import { TeamMembersManager } from "./team-members-manager";
import { TeamTabs } from "./team-tabs";

/**
 * Team detail — its membership (with maintainer/member roles) and the projects it
 * owns in the catalog. Any org member can view; managing the team is open to org
 * owners/admins and this team's maintainers.
 */
export default async function TeamDetail({
  params,
}: {
  params: Promise<{ org: string; team: string }>;
}) {
  const { org: slug, team: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const team = await getTeam(slug, key);
  if (!team) notFound();

  const [teamMembers, orgMembers, projects] = await Promise.all([
    listTeamMembers(slug, key),
    getOrgMembers(membership.id),
    listProjects(slug),
  ]);

  const isManager = canManageOrg(membership.role);
  const isMaintainer = teamMembers.some(
    (m) => m.userId === session.user.id && m.role === "maintainer",
  );
  const canManageTeam = isManager || isMaintainer;

  const ownedProjects = projects.filter((p) => p.ownerTeam?.key === key);
  const onTeam = new Set(teamMembers.map((m) => m.userId));
  const available = orgMembers
    .filter((m) => !onTeam.has(m.userId))
    .map((m) => ({ userId: m.userId, name: m.name, email: m.email, username: m.username }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/teams`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Teams
      </Link>

      <TeamHeader
        slug={slug}
        team={{ key: team.key, name: team.name, description: team.description }}
        canEdit={canManageTeam}
        canDelete={isManager}
      />

      <TeamTabs
        slug={slug}
        memberCount={team.memberCount}
        ownedCount={ownedProjects.length}
        ownedProjects={ownedProjects.map((p) => ({ key: p.key, name: p.name }))}
        membersManager={
          <TeamMembersManager
            slug={slug}
            teamKey={team.key}
            members={teamMembers.map((m) => ({
              userId: m.userId,
              name: m.name,
              email: m.email,
              username: m.username,
              role: m.role,
            }))}
            available={available}
            canManage={canManageTeam}
          />
        }
      />
    </div>
  );
}
