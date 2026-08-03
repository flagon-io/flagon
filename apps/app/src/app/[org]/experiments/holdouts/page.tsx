import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listHoldouts } from "@/lib/experiments-api";
import { FLAG_ENVIRONMENTS } from "@/lib/flags-api";
import { HoldoutsManager } from "./holdouts-manager";

/**
 * Holdouts: a deterministic global control group held out of all experiments in an
 * environment, so you can measure your program's aggregate impact against a clean
 * baseline. Enforced at evaluation time.
 */
export default async function HoldoutsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const holdouts = await listHoldouts(slug);

  return (
    <HoldoutsManager
      slug={slug}
      holdouts={holdouts}
      environments={FLAG_ENVIRONMENTS.map((e) => ({ key: e.key, name: e.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
