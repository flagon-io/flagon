import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listRunbooks } from "@/lib/runbooks-api";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { RunbooksManager } from "./runbooks-manager";

/**
 * Runbooks — reusable playbooks whose steps become an incident's checklist. Attach
 * by service or severity threshold; on declare, the matching steps land on the
 * incident ready to work through. This index is read-only; editing happens on the
 * dedicated per-runbook editor page.
 */
export default async function RunbooksPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ create?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [runbooks, levels] = await Promise.all([listRunbooks(slug), getSeverityLevels(slug)]);

  return (
    <RunbooksManager
      slug={slug}
      runbooks={runbooks}
      levels={levels}
      canManage={canManageOrg(membership.role)}
      initialCreate={Boolean(sp.create)}
    />
  );
}
