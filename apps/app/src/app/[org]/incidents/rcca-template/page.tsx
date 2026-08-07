import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getRccaTemplate } from "@/lib/rcca-template-api";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { RccaTemplateEditor } from "./rcca-template-editor";

/**
 * Org-level RCCA template: which severities require a postmortem, and the fields
 * every RCCA collects. Seeded with a standard template; managers customize it.
 */
export default async function RccaTemplatePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [template, levels] = await Promise.all([getRccaTemplate(slug), getSeverityLevels(slug)]);

  return <RccaTemplateEditor slug={slug} template={template} levels={levels} canManage={canManageOrg(membership.role)} />;
}
