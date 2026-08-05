import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getOrgMembers } from "@/lib/org";
import { getUploadConfig } from "@/lib/uploads-api";
import { getOrgSettlement } from "@/lib/org-lifecycle";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { OrgGeneralForm } from "./general-form";
import { LogoUpload } from "./logo-upload";
import { DangerZone } from "./danger-zone";

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
  const isOwner = membership.role === "owner";
  const uploadConfig = await getUploadConfig(slug);
  const orgMembers = await getOrgMembers(membership.id);
  // Deletion settlement preview — owner only (the only role that can delete).
  const settlement = isOwner ? await getOrgSettlement(slug) : null;

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Organization"
        description="Your organization's name, URL, and plan."
      />

      {/* GitHub-style: the form fields on the left, the logo on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
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

        <SettingsSection
          title="Logo"
          description="Shown wherever your organization appears."
        >
          <LogoUpload
            slug={membership.slug}
            orgName={membership.name}
            initialLogo={membership.logo}
            canManage={canManage}
            uploadsEnabled={uploadConfig.enabled}
            maxSizeBytes={uploadConfig.maxSizeBytes}
            acceptedTypes={uploadConfig.acceptedTypes}
          />
        </SettingsSection>
      </div>

      <DangerZone
        slug={membership.slug}
        orgId={membership.id}
        orgName={membership.name}
        isOwner={isOwner}
        currentUserId={session.user.id}
        members={orgMembers.map((m) => ({
          memberId: m.memberId,
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
        }))}
        settlement={settlement}
      />
    </div>
  );
}
