import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getIntegrations } from "@/lib/integrations-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ProviderSection } from "../provider-section";
import { IntegrationOptions } from "../integration-options";

/**
 * The setup page for a single bring-your-own provider (e.g. Twilio). This is
 * where credentials are entered, tested, and managed — the list page only routes
 * here. 404s for an unknown provider so the URL space stays honest.
 */
export default async function IntegrationProviderPage({
  params,
}: {
  params: Promise<{ org: string; provider: string }>;
}) {
  const { org: slug, provider } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  const canManage = canManageOrg(membership.role);

  const catalog = await getIntegrations(slug);
  const entry = catalog?.providers.find((p) => p.key === provider);
  // Only bring-your-own providers that are live have a credential setup form; OAuth
  // app-installs and planned providers have nothing to configure here yet.
  if (!entry || entry.connection !== "byo" || entry.status !== "available") notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/${slug}/settings/integrations`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft className="size-3.5" />
          Integrations
        </Link>
        <SettingsHeader title={entry.label} description={entry.summary} />
      </div>

      <SettingsSection
        title="Credentials"
        description={`Connect Flagon to your ${entry.label} account. Credentials are encrypted at rest and used only to send on your behalf.`}
      >
        <ProviderSection
          slug={slug}
          entry={entry}
          canManage={canManage}
          secretsEnabled={catalog?.secretsEnabled ?? false}
        />
      </SettingsSection>

      {entry.integration?.connected && entry.options.length > 0 ? (
        <SettingsSection
          title="How Flagon uses this"
          description={`Choose what Flagon does with your ${entry.label} account. Turn a capability off and Flagon stops using it, without removing your credentials.`}
        >
          <IntegrationOptions slug={slug} entry={entry} canManage={canManage} />
        </SettingsSection>
      ) : null}
    </div>
  );
}
