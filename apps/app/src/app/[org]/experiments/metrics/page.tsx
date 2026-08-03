import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listMetrics } from "@/lib/experiments-api";
import { MetricsManager } from "./metrics-manager";

/**
 * Metrics: the reusable goal definitions experiments measure. Kept within the
 * experiments feature (distinct from any future observability metrics). Data over
 * HTTP; the console never touches the tables directly.
 */
export default async function MetricsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const metrics = await listMetrics(slug);

  return (
    <MetricsManager slug={slug} metrics={metrics} canManage={canManageOrg(membership.role)} />
  );
}
