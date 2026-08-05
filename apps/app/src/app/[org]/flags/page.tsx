import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { listFlags } from "@/lib/flags-api";
import { FlagsTable } from "./flags-table";

/**
 * The Flags list. Flags are GLOBAL to the organization (evaluated with your SDK
 * keys across any project), so they live at the org level. Data comes from the
 * API over HTTP — the console never touches flag tables directly.
 */
export default async function FlagsOverview({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ create?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const flags = await listFlags(slug);

  return <FlagsTable slug={slug} flags={flags} initialCreate={Boolean(sp.create)} />;
}
