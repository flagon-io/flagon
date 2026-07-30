import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getSession } from "@/lib/auth";
import { PROJECTS_ENABLED } from "@/lib/features";
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

  // Projects is a WIP feature (see @/lib/features). While it's off, the org home
  // shows a placeholder instead of the catalog.
  if (!PROJECTS_ENABLED) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-20 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Boxes className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">Projects are coming soon</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Connect a repository and build on top of it. In the meantime, manage
            your feature flags from the sidebar.
          </p>
        </div>
      </div>
    );
  }

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
