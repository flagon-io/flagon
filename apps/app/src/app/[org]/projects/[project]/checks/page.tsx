import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { listChecks } from "@/lib/checks-api";
import { ProjectChecks } from "./project-checks";

/**
 * A project's Checks tab — every check related to this project, plus a "New check" flow
 * that preselects it (mirrors the project Incidents tab).
 */
export default async function ProjectChecksPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [project, checks] = await Promise.all([getProject(slug, key), listChecks(slug, { projectKey: key })]);
  if (!project) notFound();

  return (
    <ProjectChecks
      slug={slug}
      projectKey={project.key}
      projectName={project.name}
      checks={checks}
      canManage={canManageOrg(membership.role)}
    />
  );
}
