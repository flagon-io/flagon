import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { listChecks } from "@/lib/checks-api";
import { ChecksView } from "./checks-view";

/**
 * A project's Checks tab — synthetic monitors on this service, their live status, and
 * a create flow. Detection layer of the reliability product: a failing check can post
 * to a Slack/webhook/email channel and/or open an incident.
 */
export default async function ProjectChecksPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [project, checks] = await Promise.all([getProject(slug, key), listChecks(slug, key)]);
  if (!project) notFound();

  return (
    <ChecksView
      slug={slug}
      projectKey={project.key}
      projectName={project.name}
      checks={checks}
      canManage={canManageOrg(membership.role)}
    />
  );
}
