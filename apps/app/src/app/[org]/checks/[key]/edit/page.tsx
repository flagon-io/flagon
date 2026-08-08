import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getCheck, listAlertChannels, listMonitorTypes } from "@/lib/checks-api";
import { listProjects } from "@/lib/projects-api";
import { ConfigForm } from "../../new/[type]/config-form";

/** Edit an existing check — the same rich config form, prefilled, in edit mode. */
export default async function EditCheckPage({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/${key}`);

  const [check, types, channels, projects] = await Promise.all([
    getCheck(slug, key),
    listMonitorTypes(slug),
    listAlertChannels(slug),
    listProjects(slug),
  ]);
  if (!check) notFound();
  const monitor = types.find((t) => t.key === check.type);
  if (!monitor) redirect(`/${slug}/checks/${key}`);

  return (
    <ConfigForm
      slug={slug}
      monitor={monitor}
      channels={channels.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
      mode="edit"
      initial={check}
    />
  );
}
