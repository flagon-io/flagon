import { headers } from "next/headers";

type SSOResolution =
  | { action: "link"; userId: string; profile: "preserve" | "update" }
  | { action: "continue" };

/**
 * SSO identity resolution, GitHub-style. If the person is ALREADY signed in when
 * they go through an org's SSO, link that org's SSO identity to their CURRENT
 * account - whatever email the IdP asserts - so one account carries many org SSO
 * identities. Otherwise, defer to the plugin's default (sign into the already-linked
 * account, or create a new one).
 *
 * `auth` is imported lazily to avoid a static import cycle with lib/auth.ts (this
 * function is referenced from the SSO plugin config there); by call time the module
 * is fully initialized.
 */
export async function resolveSSOUserToCurrentSession(): Promise<SSOResolution> {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return { action: "link", userId: session.user.id, profile: "preserve" };
  }
  return { action: "continue" };
}
