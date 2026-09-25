import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { OrgGeneralForm } from "@/components/orgs/org-general-form";
import { DeleteOrgDangerZone } from "@/components/orgs/delete-org-danger-zone";
import { PageBody } from "@/components/shell/page-header";

export default async function OrgSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { org, role } = await getOrgContext(slug);
  const canManage = isOrgAdmin(role);

  return (
    <PageBody>
      <div className="space-y-10">
        <OrgGeneralForm slug={slug} orgId={org.id} initialName={org.name} canManage={canManage} />
        {role === "owner" && <DeleteOrgDangerZone slug={slug} name={org.name} />}
      </div>
    </PageBody>
  );
}
