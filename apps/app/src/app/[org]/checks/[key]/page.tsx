import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getCheck, listAlertChannels, listCheckResults } from "@/lib/checks-api";
import { CheckDetail } from "./check-detail";

// "Run now" on a browser check waits on the browser function (Chromium ~30-40s); give the
// server action room beyond the default function limit.
export const maxDuration = 60;

/**
 * A check's detail: its live status + config, the recent run history, and (for
 * managers) run-now / pause / mute / delete.
 */
export default async function CheckDetailPage({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const check = await getCheck(slug, key);
  if (!check) notFound();
  const [results, channels] = await Promise.all([listCheckResults(slug, key), listAlertChannels(slug)]);

  return (
    <CheckDetail
      slug={slug}
      check={check}
      results={results}
      channels={channels.map((c) => ({ id: c.id, name: c.name }))}
      canManage={canManageOrg(membership.role)}
    />
  );
}
