import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getRunbook, listRunbooks } from "@/lib/runbooks-api";
import { listProjects } from "@/lib/projects-api";
import { RunbooksManager } from "./runbooks-manager";

/**
 * Runbooks — reusable playbooks whose steps become an incident's checklist. Attach
 * by service or severity threshold; on declare, the matching steps land on the
 * incident ready to work through.
 */
export default async function RunbooksPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const runbooks = await listRunbooks(slug);
  const [details, projects] = await Promise.all([
    Promise.all(runbooks.map((r) => getRunbook(slug, r.key))),
    listProjects(slug),
  ]);

  return (
    <RunbooksManager
      slug={slug}
      runbooks={details.filter((d): d is NonNullable<typeof d> => d !== null)}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
