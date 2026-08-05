import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getSchedule } from "@/lib/oncall-api";
import { listMembers } from "@/lib/flags-api";
import { listTeams } from "@/lib/teams-api";
import { ScheduleEditor } from "./schedule-editor";

/**
 * The dedicated on-call schedule editor: a two-column workspace (the rotation and
 * an upcoming-shifts timeline on the left, a details + overrides sidebar on the
 * right) for a single schedule. Read-only for non-managers.
 */
export default async function ScheduleEditorPage({ params }: { params: Promise<{ org: string; key: string }> }) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [detail, orgMembers, teams] = await Promise.all([
    getSchedule(slug, key),
    listMembers(slug),
    listTeams(slug),
  ]);
  if (!detail) notFound();

  return (
    <ScheduleEditor
      slug={slug}
      detail={detail}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
