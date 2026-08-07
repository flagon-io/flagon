import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { getUptime } from "@/lib/uptime-api";
import { UptimeView } from "./uptime-view";

/**
 * Uptime — measured weighted uptime per service and for the platform, plus attainment
 * for any reliability objectives. Severity weights decide how each incident counts;
 * platform mode decides how it rolls into the global total.
 */
export default async function UptimePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const windowDays = sp.window ? Number(sp.window) : 30;
  const report = await getUptime(slug, { window: Number.isFinite(windowDays) ? windowDays : 30 });

  return <UptimeView slug={slug} report={report} windowDays={Number.isFinite(windowDays) ? windowDays : 30} />;
}
