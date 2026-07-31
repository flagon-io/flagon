import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Boxes } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getOrgMembers } from "@/lib/org";
import { getTeam, listTeamMembers } from "@/lib/teams-api";
import { listProjects } from "@/lib/projects-api";
import { SettingsSection } from "@/components/settings/section";
import { TeamHeader } from "./team-header";
import { TeamMembersManager } from "./team-members-manager";

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
        <ArrowLeft className="h-4 w-4" /> Teams
      </Link>

      <TeamHeader
        slug={slug}
        team={{ key: team.key, name: team.name, description: team.description }}
        canEdit={canManageTeam}
        canDelete={isManager}
      />

      <SettingsSection
        title="Members"
        description={`${team.memberCount} ${team.memberCount === 1 ? "person" : "people"} on this team`}
      >
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
      </SettingsSection>

      <SettingsSection
        title="Owned projects"
        description="Projects in the catalog this team owns."
      >
        {ownedProjects.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No projects yet. Assign this team as the owner from a project&apos;s
            settings.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
            {ownedProjects.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/${slug}/projects/${p.key}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/3"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                    <Boxes className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{p.name}</p>
                    <p className="truncate font-mono text-xs text-zinc-500">{p.key}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
