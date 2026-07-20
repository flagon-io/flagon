import { appPath } from "@/lib/urls";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * App root - `app.flagon.io/` (locally `/app`). Pure router: new users land
 * straight in the create-organization flow; everyone else lands in their
 * active (or first) organization. The full organization list lives in
 * settings, like the rest of account management.
 */
export default async function AppIndexPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(appPath("/signin"));

  const orgs = await auth.api.listOrganizations({ headers: requestHeaders });
  if (orgs.length === 0) redirect(appPath("/new"));

  const active =
    orgs.find((org) => org.id === session.session.activeOrganizationId) ??
    orgs[0];
  redirect(appPath(`/${active.slug}`));
}
