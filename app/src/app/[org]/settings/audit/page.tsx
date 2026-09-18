import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAuditConfig, getMe, listAuditPage, type AuditConfig, type AuditPage } from "@/lib/flagon-api";
import { PageBody } from "@/components/shell/page-header";
import { AuditLog } from "@/components/audit/audit-log";

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const [me, session] = await Promise.all([
    getMe().catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session || !me) redirect("/login");
  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/");
  // Audit log is owners/admins only (GitHub model). Send members back to settings.
  if (org.role !== "owner" && org.role !== "admin") redirect(`/${slug}/settings`);

  const [initial, config] = await Promise.all([
    listAuditPage(slug, { perPage: 30 }).catch(() => ({ events: [], next: null }) as AuditPage),
    getAuditConfig(slug).catch(() => ({ ip_disclosure: false }) as AuditConfig),
  ]);

  return (
    <PageBody className="max-w-4xl">
      <AuditLog orgSlug={slug} initial={initial} initialConfig={config} />
    </PageBody>
  );
}
