import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getRunbook } from "@/lib/runbooks-api";
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

  const detail = await getRunbook(slug, key);
  if (!detail) notFound();

  return (
    <RunbookEditor
      slug={slug}
      detail={detail}
      canManage={canManageOrg(membership.role)}
    />
  );
}
