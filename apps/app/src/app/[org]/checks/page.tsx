import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listChecks } from "@/lib/checks-api";
import { ChecksView } from "./checks-view";

/**
 * Checks — the uptime + synthetic monitoring home. Lists the org's checks grouped
 * by family (uptime monitors, synthetic checks), each routing to its detail page.
 */
export default async function ChecksPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const checks = await listChecks(slug);
  return <ChecksView slug={slug} checks={checks} canManage={canManageOrg(membership.role)} />;
}
