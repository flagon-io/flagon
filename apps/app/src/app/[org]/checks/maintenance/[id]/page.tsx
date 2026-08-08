import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getMaintenanceWindow } from "@/lib/checks-api";
import { MaintenanceForm } from "../maintenance-form";

/** Edit an existing maintenance window. */
export default async function EditMaintenancePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org: slug, id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/maintenance`);

  const window = await getMaintenanceWindow(slug, id);
  if (!window) notFound();

  return <MaintenanceForm slug={slug} mode="edit" window={window} />;
}
