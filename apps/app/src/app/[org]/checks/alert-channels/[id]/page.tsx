import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getAlertChannel } from "@/lib/checks-api";
import { AlertChannelForm } from "../alert-channel-form";

/** Edit an existing alert channel — the same config page, prefilled, in edit mode. */
export default async function EditChannelPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org: slug, id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/checks/alert-channels`);

  const channel = await getAlertChannel(slug, id);
  if (!channel) notFound();

  return <AlertChannelForm slug={slug} mode="edit" channel={channel} />;
}
