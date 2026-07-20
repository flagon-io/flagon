import { appPath } from "@/lib/urls";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Signed-in users have no business on the sign-in / sign-up forms; bounce them
 * to the console.
 */
export async function redirectIfAuthenticated(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(appPath(""));
}
