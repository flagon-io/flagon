import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { listIncidents } from "@/lib/incidents-api";
import { listPolicies } from "@/lib/oncall-api";
import { listProjects } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { ProjectIncidents } from "./project-incidents";

/**
 * A project's incidents tab — every incident (open + resolved) whose blast radius
 * includes this service, plus a declare flow that preselects it.
 */
export default async function ProjectIncidentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ declare?: string }>;
}) {
  const { org: slug, project: key } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [project, incidents, teams, projects, policies] = await Promise.all([
    getProject(slug, key),
    listIncidents(slug, { project: key }),
    listTeams(slug),
    listProjects(slug),
    listPolicies(slug),
  ]);
  if (!project) notFound();

  return (
    <ProjectIncidents
      slug={slug}
      projectKey={project.key}
      projectName={project.name}
      incidents={incidents}
      canManage={canManageOrg(membership.role)}
      teams={teams.map((t) => ({ key: t.key, name: t.name }))}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      policies={policies.map((p) => ({ key: p.key, name: p.name }))}
      autoDeclare={Boolean(sp.declare)}
    />
  );
}
