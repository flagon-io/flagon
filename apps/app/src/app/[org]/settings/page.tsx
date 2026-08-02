import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getUploadConfig } from "@/lib/uploads-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { OrgGeneralForm } from "./general-form";
import { LogoUpload } from "./logo-upload";
import { ProjectCreationForm } from "./project-creation-form";

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
  const uploadConfig = await getUploadConfig(slug);

  return (
    <div className="flex flex-col gap-6">
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

      <SettingsSection
        title="Logo"
        description="Shown across the console wherever your organization appears."
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

      <SettingsSection
        title="Project creation"
        description={
          canManage
            ? "Choose who can create projects. Owners and admins always can."
            : "Who can create projects in this organization."
        }
      >
        <ProjectCreationForm
          slug={membership.slug}
          initialPolicy={membership.projectCreationPolicy}
          canManage={canManage}
        />
      </SettingsSection>
    </div>
  );
}
