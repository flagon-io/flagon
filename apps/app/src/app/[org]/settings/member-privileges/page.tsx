import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ProjectCreationForm } from "../project-creation-form";

export const metadata: Metadata = { title: "Member privileges · Organization settings" };

/**
 * Member privileges — base permissions members get across the org, GitHub-style
 * (their "Member privileges" page). Today: who may create projects. This is the
 * home for future base-permission controls.
 */
export default async function MemberPrivilegesPage({
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
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Member privileges"
        description="Base permissions that apply to everyone in this organization."
      />
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
