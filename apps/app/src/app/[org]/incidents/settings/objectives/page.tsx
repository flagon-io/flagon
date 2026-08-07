import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listObjectives } from "@/lib/objectives-api";
import { listProjects } from "@/lib/projects-api";
import { ObjectivesManager } from "./objectives-manager";

/**
 * Reliability objectives (optional SLO/SLA). Entirely opt-in: an org that wants a
 * target defines one here; otherwise the Uptime view just shows measured uptime.
 */
export default async function ObjectivesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [objectives, projects] = await Promise.all([listObjectives(slug), listProjects(slug)]);
  return (
    <ObjectivesManager
      slug={slug}
      objectives={objectives}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
