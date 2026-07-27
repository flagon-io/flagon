import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { OrgGeneralForm } from "./general-form";

export const metadata: Metadata = { title: "General · Organization settings" };

export default async function OrgGeneralSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const canManage = canManageOrg(membership.role);

  return (
    <div>
      <SettingsHeader
        title="Organization"
        description="Your organization's name, URL, and plan."
      />
      <SettingsSection
        title="General"
        description={
          canManage
            ? "Renaming or changing the URL affects everyone in the organization."
            : "Only owners and admins can change these settings."
        }
      >
        <OrgGeneralForm
          currentSlug={membership.slug}
          initialName={membership.name}
          initialPlan={membership.plan}
          canManage={canManage}
        />
      </SettingsSection>
    </div>
  );
}
