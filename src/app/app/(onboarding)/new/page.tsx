import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { isPlanId, SELF_SERVE_PLANS, type PlanId } from "@/lib/plans";
import { userOwnsFreeOrg } from "@/lib/plans.server";
import { listedPlanVersions, toPlanColumn } from "@/lib/plan-catalog.server";
import { NewOrgForm } from "./new-org-form";

export const metadata: Metadata = {
  title: "New organization",
};

/**
 * Dedicated organization-creation flow (`/app/new` - "new" is a reserved
 * slug). Coming from the pricing page, ?plan= preselects the plan so the
 * user only fills in org details (price first, context second).
 */
export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(appPath("/signin"));

  const { plan } = await searchParams;
  const billing = billingEnabled();
  const ownsFreeOrg = billing ? await userOwnsFreeOrg(session.user.id) : false;

  const preselectedPlan: PlanId | null =
    plan && isPlanId(plan) && SELF_SERVE_PLANS.includes(plan) ? plan : null;

  // Resolved server-side and passed down: the columns render from the same
  // rows the pricing page uses, so the plan a customer picked on the website is
  // the plan they see here, priced identically.
  const plans = (await listedPlanVersions()).map(toPlanColumn);

  return (
    <NewOrgForm
      billingEnabled={billing}
      ownsFreeOrg={ownsFreeOrg}
      preselectedPlan={preselectedPlan}
      plans={plans}
    />
  );
}
