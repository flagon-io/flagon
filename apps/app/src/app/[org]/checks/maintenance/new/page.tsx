import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listChecks } from "@/lib/checks-api";
import { MaintenanceForm } from "../maintenance-form";

/** Create a new maintenance window. */
export default async function NewMaintenancePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/maintenance`);

  const checks = await listChecks(slug);
  return (
    <MaintenanceForm slug={slug} mode="create" checks={checks.map((c) => ({ key: c.key, name: c.name }))} />
  );
}
