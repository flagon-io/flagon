import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getIntegrations } from "@/lib/integrations-api";
import { getRunbook } from "@/lib/runbooks-api";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { RunbookEditor } from "./runbook-editor";

/**
 * The dedicated runbook editor: a two-column workspace (ordered steps on the left,
 * details sidebar on the right) for a single playbook. Read-only for non-managers.
 */
export default async function RunbookEditorPage({ params }: { params: Promise<{ org: string; key: string }> }) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const canManage = canManageOrg(membership.role);
  const [detail, levels, catalog] = await Promise.all([
    getRunbook(slug, key),
    getSeverityLevels(slug),
    // The canonical integrations catalog: the Add-step modal derives its step
    // providers from it (by capability) and gates them on real connection state.
    getIntegrations(slug),
  ]);
  if (!detail) notFound();

  return (
    <RunbookEditor
      slug={slug}
      detail={detail}
      levels={levels}
      canManage={canManage}
      catalog={catalog?.providers ?? []}
    />
  );
}
