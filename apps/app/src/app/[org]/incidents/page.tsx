import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listIncidents } from "@/lib/incidents-api";
import { listPolicies } from "@/lib/oncall-api";
import { listProjects } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { IncidentsView } from "./incidents-view";

/**
 * Incidents — the reliability home. The open + resolved incidents, and (for
 * managers) the declare flow that attaches affected services from the catalog.
 */
export default async function IncidentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ project?: string; declare?: string; service?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const filterProject = typeof sp.project === "string" ? sp.project : undefined;
  const autoDeclareService = sp.declare && typeof sp.service === "string" ? sp.service : undefined;

  const [incidents, teams, projects, policies] = await Promise.all([
    listIncidents(slug, filterProject ? { project: filterProject } : undefined),
    listTeams(slug),
    listProjects(slug),
    listPolicies(slug),
  ]);

  return (
    <IncidentsView
      slug={slug}
      incidents={incidents}
      canManage={canManageOrg(membership.role)}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      policies={policies.map((p) => ({ key: p.key, name: p.name }))}
      filterProject={filterProject}
      autoDeclareService={autoDeclareService}
    />
  );
}
