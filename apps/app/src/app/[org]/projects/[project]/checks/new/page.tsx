import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { listAlertChannels } from "@/lib/alert-channels-api";
import { listPolicies } from "@/lib/oncall-api";
import { listRunbooks } from "@/lib/runbooks-api";
import { CheckForm } from "../check-form";

/** Full-page create-check form for a project (owner/admin). */
export default async function NewCheckPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/projects/${key}/checks`);

  const [project, channels, policies, runbooks] = await Promise.all([
    getProject(slug, key),
    listAlertChannels(slug),
    listPolicies(slug),
    listRunbooks(slug),
  ]);
  if (!project) notFound();

  return (
    <CheckForm
      slug={slug}
      projectKey={project.key}
      channels={channels.map((c) => ({ key: c.key, name: c.name, type: c.type }))}
      policies={policies.map((p) => ({ key: p.key, name: p.name }))}
      runbooks={runbooks.map((r) => ({ key: r.key, name: r.name }))}
      backHref={`/${slug}/projects/${project.key}/checks`}
    />
  );
}
