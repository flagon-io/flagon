import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { SeveritiesManager } from "./severities-manager";

/**
 * Org-level severity ladder: the org names its own levels (P0..P4, sev1..sev4, ...),
 * describes each, and sets how much each counts against a service's uptime and the
 * platform total. Managers edit; anyone can view.
 */
export default async function SeveritiesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const levels = await getSeverityLevels(slug);
  return <SeveritiesManager slug={slug} levels={levels} canManage={canManageOrg(membership.role)} />;
}
