import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUserOrganizations } from "@/lib/org";

/**
 * The app root is a router, not a page: it forwards you to where you belong and
 * never renders anything itself.
 *
 *   signed out                 -> /login
 *   no organizations           -> /new     (create your first org, pick a plan)
 *   one org / a remembered one -> /<slug>  (straight into the workspace)
 *   several, none remembered   -> /select  (choose which to open)
 *
 * "Remembered" is the session's active organization, set when you pick or switch
 * orgs. There is no auto-provisioned personal org: a new user always creates one.
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgs = await getUserOrganizations(session.user.id);
  if (orgs.length === 0) redirect("/new");

  const activeId = session.session.activeOrganizationId;
  const active = activeId ? orgs.find((o) => o.id === activeId) : undefined;
  if (active) redirect(`/${active.slug}`);

  if (orgs.length === 1) redirect(`/${orgs[0].slug}`);

  redirect("/select");
}
