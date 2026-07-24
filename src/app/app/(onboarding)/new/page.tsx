import type { Metadata } from "next";
import { requireSession } from "@/lib/auth-guards.server";
import { billingEnabled } from "@/lib/billing";
import { isPlanId, SELF_SERVE_PLANS, type PlanId } from "@/lib/plans";
import { userOwnsFreeOrg } from "@/lib/plans.server";
import { proHeadline } from "@/lib/plan-catalog.server";
import { marketingColumns } from "@/lib/marketing-plans";
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
  const session = await requireSession();

  const { plan } = await searchParams;
  const billing = billingEnabled();
  const ownsFreeOrg = billing ? await userOwnsFreeOrg(session.user.id) : false;

  const preselectedPlan: PlanId | null =
    plan && isPlanId(plan) && SELF_SERVE_PLANS.includes(plan) ? plan : null;

  // The same static marketing columns the pricing page shows, with the live Pro
  // price so the number matches what checkout charges. Only the self-serve
  // plans (Hobby, Pro) are pickable here; Enterprise is a marketing card.
  const plans = marketingColumns(await proHeadline()).filter(
    (column) => column.selfServe,
  );

  return (
    <NewOrgForm
      billingEnabled={billing}
      ownsFreeOrg={ownsFreeOrg}
      preselectedPlan={preselectedPlan}
      plans={plans}
    />
  );
}
