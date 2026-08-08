import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listAlertChannels } from "@/lib/checks-api";
import { AlertChannelsList } from "./channels-list";

/**
 * Alert channels — the "Communicate" home for Checks (Checkly-style Alerts page): global
 * alert settings, then your channels list with a "New alert channel" button. Creating one
 * routes to the type picker, then the per-type config page.
 */
export default async function AlertChannelsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const channels = await listAlertChannels(slug);
  return <AlertChannelsList slug={slug} channels={channels} canManage={canManageOrg(membership.role)} />;
}
