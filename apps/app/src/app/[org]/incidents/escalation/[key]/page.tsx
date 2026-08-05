import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getPolicy, listSchedules } from "@/lib/oncall-api";
import { listMembers } from "@/lib/flags-api";
import { listTeams } from "@/lib/teams-api";
import { PolicyEditor } from "./policy-editor";

/**
 * The dedicated escalation-policy editor: a two-column workspace (ordered levels
 * on the left, details sidebar on the right) for a single ladder. Read-only for
 * non-managers.
 */
export default async function PolicyEditorPage({ params }: { params: Promise<{ org: string; key: string }> }) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [detail, schedules, teams, orgMembers] = await Promise.all([
    getPolicy(slug, key),
    listSchedules(slug),
    listTeams(slug),
    listMembers(slug),
  ]);
  if (!detail) notFound();

  return (
    <PolicyEditor
      slug={slug}
      detail={detail}
      schedules={schedules.map((s) => ({ key: s.key, name: s.name }))}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
