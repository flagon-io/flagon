import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listChannels } from "@/lib/notifications-api";
import { ChannelsManager } from "./channels-manager";

/**
 * Account notification channels — how incident pages reach you, wherever you're on
 * call. Personal (not org-scoped): email delivers today; SMS, voice, mobile push,
 * and Slack are scaffolded until their providers land.
 */
export default async function NotificationsSettings() {
  const session = await getSession();
  if (!session) redirect("/login");
  const channels = await listChannels();
  return <ChannelsManager channels={channels} accountEmail={session.user.email} />;
}
