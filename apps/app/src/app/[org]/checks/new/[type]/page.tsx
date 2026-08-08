import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listAlertChannels, listMonitorTypes } from "@/lib/checks-api";
import { listProjects } from "@/lib/projects-api";
import { ConfigForm } from "./config-form";

/**
 * The config form for one monitor type. Only types the API implements reach here; an
 * unknown or not-yet-shipped type bounces back to the catalog.
 */
export default async function NewTypedCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; type: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { org: slug, type } = await params;
  const { project: defaultProjectKey } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks`);

  const [types, channels, projects] = await Promise.all([
    listMonitorTypes(slug),
    listAlertChannels(slug),
    listProjects(slug),
  ]);
  const monitor = types.find((t) => t.key === type);
  if (!monitor) redirect(`/${slug}/checks/new`);

  return (
    <ConfigForm
      slug={slug}
      monitor={monitor}
      channels={channels.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
      defaultProjectKey={defaultProjectKey}
    />
  );
}
