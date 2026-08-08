import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listMonitorTypes } from "@/lib/checks-api";
import { NewCheckCatalog } from "./catalog-view";

/**
 * The "Detect" catalog — every check + monitor type, Checkly-style. Types we support
 * today route to their config form; the rest show as "Soon" so the full roadmap reads
 * at a glance. The implemented set is the API's monitor-types (one source of truth).
 */
export default async function NewCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { org: slug } = await params;
  const { project } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks`);

  const types = await listMonitorTypes(slug);
  return <NewCheckCatalog slug={slug} implemented={types.map((t) => t.key)} projectKey={project} />;
}
