import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getSchedule, listSchedules } from "@/lib/oncall-api";
import { listMembers } from "@/lib/flags-api";
import { listTeams } from "@/lib/teams-api";
import { SchedulesManager } from "./schedules-manager";

/** On-call schedules — rotations (team-bound or standalone) with overrides. */
export default async function OnCallPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const schedules = await listSchedules(slug);
  const [details, teams, orgMembers] = await Promise.all([
    Promise.all(schedules.map((s) => getSchedule(slug, s.key))),
    listTeams(slug),
    listMembers(slug),
  ]);

  return (
    <SchedulesManager
      slug={slug}
      schedules={details.filter((d): d is NonNullable<typeof d> => d !== null)}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
