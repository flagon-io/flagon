import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getPolicy, listPolicies, listSchedules } from "@/lib/oncall-api";
import { listMembers } from "@/lib/flags-api";
import { listTeams } from "@/lib/teams-api";
import { PoliciesManager } from "./policies-manager";

/** Escalation policies — the ordered ladder an unacked incident climbs. */
export default async function EscalationPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const policies = await listPolicies(slug);
  const [details, schedules, teams, orgMembers] = await Promise.all([
    Promise.all(policies.map((p) => getPolicy(slug, p.key))),
    listSchedules(slug),
    listTeams(slug),
    listMembers(slug),
  ]);

  return (
    <PoliciesManager
      slug={slug}
      policies={details.filter((d): d is NonNullable<typeof d> => d !== null)}
      schedules={schedules.map((s) => ({ key: s.key, name: s.name }))}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
