import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listProjects } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { getOrgUsage } from "@/lib/flags-api";
import { ProjectsView } from "./projects-view";

/** A UTC day string (YYYY-MM-DD) `offset` days before now, for the usage range. */
function dayString(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The organization home: its Projects list — the catalog of what exists. Any
 * member sees the list; who may create is the org's base permission (owners and
 * admins always; members when the org opens it up). Deployments and the rest
 * live under an individual project, not at this level.
 */
export default async function OrgProjects({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  // Projects + the usage overview (the sidebar) in parallel. The entitlement is
  // the CURRENT month regardless of the range we pass; usage read failures degrade
  // to a null entitlement (the sidebar renders an "unavailable" note, not an error).
  const [projects, usageResult, teams] = await Promise.all([
    listProjects(slug),
    getOrgUsage(slug, { from: dayString(29), to: dayString(0), groupBy: "meter" }),
    listTeams(slug),
  ]);
  const entitlement = usageResult?.entitlement ?? null;
  const teamOptions = teams.map((t) => ({ key: t.key, name: t.name }));

  // Who may create: managers always, members when the org's policy allows it.
  // Mirrors the API's requireProjectCreator so the UI never offers a 403.
  const canCreate =
    canManageOrg(membership.role) || membership.projectCreationPolicy === "members";

  return (
    <ProjectsView
      slug={slug}
      projects={projects}
      canCreate={canCreate}
      entitlement={entitlement}
      plan={membership.plan}
      teams={teamOptions}
    />
  );
}
