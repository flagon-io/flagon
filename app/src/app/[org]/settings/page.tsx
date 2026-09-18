import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { OrgGeneralForm } from "@/components/orgs/org-general-form";
import { PageBody } from "@/components/shell/page-header";

export default async function OrgSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const org = me?.orgs.find((o) => o.slug === slug);
  if (!org) notFound();
  const canManage = org.role === "owner" || org.role === "admin";

  return (
    <PageBody>
      <OrgGeneralForm slug={slug} orgId={org.id} initialName={org.name} canManage={canManage} />
    </PageBody>
  );
}
