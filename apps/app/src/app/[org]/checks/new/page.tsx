import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listProjects } from "@/lib/projects-api";
import { listAlertChannels } from "@/lib/alert-channels-api";
import { listPolicies } from "@/lib/oncall-api";
import { listRunbooks } from "@/lib/runbooks-api";
import { CheckForm } from "../../projects/[project]/checks/check-form";

/** Full-page create-check form from the reliability board — pick the project (owner/admin). */
export default async function NewOrgCheckPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks`);

  const [projects, channels, policies, runbooks] = await Promise.all([
    listProjects(slug),
    listAlertChannels(slug),
    listPolicies(slug),
    listRunbooks(slug),
  ]);

  return (
    <CheckForm
      slug={slug}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      channels={channels.map((c) => ({ key: c.key, name: c.name, type: c.type }))}
      policies={policies.map((p) => ({ key: p.key, name: p.name }))}
      runbooks={runbooks.map((r) => ({ key: r.key, name: r.name }))}
      backHref={`/${slug}/checks`}
    />
  );
}
