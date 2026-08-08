import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getIntegrationCapabilities } from "@/lib/integrations-api";
import { AlertChannelForm } from "../../alert-channel-form";

/**
 * Configure a new channel of the chosen type. Email and Webhook are native; SMS and Phone
 * deliver through the org's connected Twilio, so we gate them on the capability being
 * available and bounce back to the picker (to connect it) otherwise. Unknown types bounce
 * back too.
 */
const CAP: Record<string, "sms" | "voice"> = { sms: "sms", phone: "voice" };
const NATIVE = new Set(["email", "webhook"]);

export default async function NewTypedChannelPage({
  params,
}: {
  params: Promise<{ org: string; type: string }>;
}) {
  const { org: slug, type } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/alert-channels`);

  const cap = CAP[type];
  if (!NATIVE.has(type) && !cap) redirect(`/${slug}/checks/alert-channels/new`);
  if (cap) {
    const caps = await getIntegrationCapabilities(slug);
    if (!caps[cap]) redirect(`/${slug}/checks/alert-channels/new`);
  }

  return <AlertChannelForm slug={slug} mode="create" type={type} />;
}
