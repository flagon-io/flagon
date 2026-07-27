import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { getUserOrganizations } from "@/lib/org";
import { OnboardingShell } from "@/components/onboarding-shell";
import { SelectOrgList } from "./select-org-list";

export const metadata: Metadata = {
  title: "Choose an organization",
  description: `Choose an organization on ${brand.name}.`,
};

/**
 * The organization chooser, shown when a user belongs to more than one org and
 * none is remembered. Zero orgs skip to create; a single org skips straight in.
 */
export default async function SelectOrgPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgs = await getUserOrganizations(session.user.id);
  if (orgs.length === 0) redirect("/new");
  if (orgs.length === 1) redirect(`/${orgs[0].slug}`);

  return (
    <OnboardingShell
      user={{
        name: session.user.name,
        email: session.user.email,
        username: session.user.username ?? null,
      }}
      title="Choose an organization"
      subtitle="You belong to a few. Pick one to open its workspace."
    >
      <SelectOrgList orgs={orgs} />
    </OnboardingShell>
  );
}
