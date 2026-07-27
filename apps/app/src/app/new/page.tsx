import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { userHasHobbyOrg } from "@/lib/org";
import { OnboardingShell } from "@/components/onboarding-shell";
import { NewOrgForm } from "./new-org-form";

export const metadata: Metadata = {
  title: "Create an organization",
  description: `Create an organization on ${brand.name}.`,
};

/**
 * Create-organization step. Every user lands here when they have no org (there
 * is no auto-provisioned personal org). Creating is always offered; when the
 * account already owns its one Hobby organization, the plan picker disables
 * Hobby and explains why, rather than walling off the whole page.
 */
export default async function NewOrgPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const hasHobby = await userHasHobbyOrg(session.user.id);

  return (
    <OnboardingShell
      user={{
        name: session.user.name,
        email: session.user.email,
        username: session.user.username ?? null,
      }}
      title="Create your organization"
      subtitle="Your projects, environments, and teammates live inside an organization."
      size="lg"
    >
      <NewOrgForm hasHobby={hasHobby} />
    </OnboardingShell>
  );
}
