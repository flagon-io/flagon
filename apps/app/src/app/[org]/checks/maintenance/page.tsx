import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listMaintenanceWindows } from "@/lib/checks-api";
import { MaintenanceList } from "./maintenance-list";

/** Maintenance windows — the "Communicate" surface for planned downtime (Checkly-style). */
export default async function MaintenancePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const windows = await listMaintenanceWindows(slug);
  return <MaintenanceList slug={slug} windows={windows} canManage={canManageOrg(membership.role)} />;
}
