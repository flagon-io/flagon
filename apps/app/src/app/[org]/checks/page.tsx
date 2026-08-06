import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listAllChecks } from "@/lib/checks-api";
import { listProjects } from "@/lib/projects-api";
import { ChecksOverview } from "./checks-overview";

/**
 * Reliability → Checks: every synthetic monitor across all services, one board. "Add
 * check" opens the full-page form with a project picker. Per-check management lives on
 * each project's Checks tab.
 */
export default async function OrgChecksPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [checks, projects] = await Promise.all([listAllChecks(slug), listProjects(slug)]);

  return (
    <ChecksOverview slug={slug} checks={checks} canManage={canManageOrg(membership.role)} hasProjects={projects.length > 0} />
  );
}
