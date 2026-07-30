import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listGithubInstallations, listProjects } from "@/lib/projects-api";
import { ProjectsView } from "./projects-view";

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

  const [projects, installations] = await Promise.all([
    listProjects(slug),
    listGithubInstallations(slug),
  ]);

  // Who may create: managers always, members when the org's policy allows it.
  // Mirrors the API's requireProjectCreator so the UI never offers a 403.
  const canCreate =
    canManageOrg(membership.role) || membership.projectCreationPolicy === "members";

  return (
    <ProjectsView
      slug={slug}
      projects={projects}
      installations={installations}
      canCreate={canCreate}
    />
  );
}
