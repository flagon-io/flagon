import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * The app root is a router, not a page: it forwards you to where you belong.
 * Signed-in visitors go to their active tenant workspace; everyone else goes to
 * sign in. Tenant routing doesn't exist yet, and getSession() is always null
 * until auth ships, so for now every visit forwards to /login. You never see a
 * page here.
 */
export default async function Home() {
  const session = await getSession();

  if (session) {
    // TODO(tenancy): forward to the user's active tenant workspace.
  }

  redirect("/login");
}
