import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getOrgMembers } from "@/lib/org";
import { getTeam, listTeamMembers } from "@/lib/teams-api";
import { listProjects } from "@/lib/projects-api";
import { getSchedule, listSchedules } from "@/lib/oncall-api";
import { TeamHeader } from "./team-header";
import { TeamMembersManager } from "./team-members-manager";
import { TeamOncallCreate } from "./team-oncall-create";
import { TeamTabs, type TeamScheduleVM } from "./team-tabs";

/** The on-call handoff moment (weekday + time), for "on-call until …". */
function handoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const [teamMembers, orgMembers, projects, schedules] = await Promise.all([
    listTeamMembers(slug, key),
    getOrgMembers(membership.id),
    listProjects(slug),
    listSchedules(slug),
  ]);

  const isManager = canManageOrg(membership.role);
  const isMaintainer = teamMembers.some(
    (m) => m.userId === session.user.id && m.role === "maintainer",
  );
  const canManageTeam = isManager || isMaintainer;

  const ownedProjects = projects.filter((p) => p.ownerTeam?.key === key);

  // Schedules bound to this team surface here; the rotations themselves stay
  // first-class over in the reliability section. Resolve details (who's on now)
  // only for the bound ones so we do not fan out across every org schedule.
  const teamSchedules = schedules.filter((s) => s.team?.key === key);
  const details = (
    await Promise.all(teamSchedules.map((s) => getSchedule(slug, s.key)))
  ).filter((d): d is NonNullable<typeof d> => d !== null);
  const nameBy = new Map(orgMembers.map((m) => [m.userId, m.name]));
  const onTeam = new Set(teamMembers.map((m) => m.userId));
  const available = orgMembers
    .filter((m) => !onTeam.has(m.userId))
    .map((m) => ({ userId: m.userId, name: m.name, email: m.email, username: m.username }));

  // Resolve the bound schedules into plain view models server-side so the tab
  // client component gets serializable props (no Map crosses the boundary).
  const scheduleVMs: TeamScheduleVM[] = details.map((d) => ({
    key: d.schedule.key,
    name: d.schedule.name,
    rotationIntervalHours: d.schedule.rotationIntervalHours,
    currentName: d.current.current
      ? nameBy.get(d.current.current) ?? "On-call"
      : null,
    nextName: d.current.next ? nameBy.get(d.current.next) ?? null : null,
    untilLabel: d.current.until ? handoff(d.current.until) : null,
  }));

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
        canManageTeam={canManageTeam}
        schedules={scheduleVMs}
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
        oncallCreate={
          <TeamOncallCreate slug={slug} teamKey={key} canManage={canManageTeam} />
        }
      />
    </div>
  );
}
