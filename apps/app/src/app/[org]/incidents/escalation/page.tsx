import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getPolicy, listPolicies } from "@/lib/oncall-api";
import { PoliciesManager } from "./policies-manager";

/** Escalation policies index — a read-only grid of the ladders an unacked incident climbs. */
export default async function EscalationPage({
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

  // Policies are few, so fetching each detail to render a ladder summary is fine
  // here (no unbounded N+1 on a hot path).
  const summaries = await listPolicies(slug);
  const details = await Promise.all(summaries.map((p) => getPolicy(slug, p.key)));

  return (
    <PoliciesManager
      slug={slug}
      policies={details.filter((d): d is NonNullable<typeof d> => d !== null)}
      canManage={canManageOrg(membership.role)}
      initialCreate={Boolean(sp.create)}
    />
  );
}
