import { redirect } from "next/navigation";
import { getAuditConfig, listAuditPage } from "@/lib/flagon-api";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { PageBody } from "@/components/shell/page-header";
import { AuditLog } from "@/components/audit/audit-log";

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { role } = await getOrgContext(slug);
  // Audit log is owners/admins only. Send members back to settings.
  if (!isOrgAdmin(role)) redirect(`/${slug}/settings`);

  const [initial, config] = await Promise.all([
    listAuditPage(slug, { perPage: 30 }),
    getAuditConfig(slug),
  ]);

  return (
    <PageBody className="max-w-4xl">
      <AuditLog orgSlug={slug} initial={initial} initialConfig={config} />
    </PageBody>
  );
}
