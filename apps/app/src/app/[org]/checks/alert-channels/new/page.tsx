import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getIntegrations, getIntegrationCapabilities } from "@/lib/integrations-api";
import { ChannelPicker } from "./channel-picker";

/**
 * New alert channel — the type picker (Checkly-style). Choose a channel type; the choices
 * reflect the org's real Integrations (Email is native; SMS/Slack/etc. light up as their
 * integrations connect). Picking a live type routes to its config page.
 */
export default async function NewChannelPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/alert-channels`);

  const [catalog, capabilities] = await Promise.all([
    getIntegrations(slug),
    getIntegrationCapabilities(slug),
  ]);
  const providers = (catalog?.providers ?? []).map((p) => ({
    key: p.key,
    label: p.label,
    status: p.status,
    connected: p.integration?.connected ?? false,
  }));

  return <ChannelPicker slug={slug} providers={providers} capabilities={capabilities} />;
}
