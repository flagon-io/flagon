import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listAlertChannels } from "@/lib/alert-channels-api";
import { AlertChannelsView } from "./alert-channels-view";

/**
 * Settings → Alert channels: reusable outbound destinations (Slack, webhook, email)
 * that checks and incidents post to. Configure once, reference from many checks.
 */
export default async function AlertChannelsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const channels = await listAlertChannels(slug);
  return <AlertChannelsView slug={slug} channels={channels} canManage={canManageOrg(membership.role)} />;
}
