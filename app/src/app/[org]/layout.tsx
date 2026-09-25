import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getOrgContext } from "@/lib/org-context";
import { orgProviderIds } from "@/lib/sso-admin";
import { mirrorUserById } from "@/lib/user-profile";
import { AppShell } from "@/components/shell/app-shell";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  // Signed out -> /login; not a member of this slug (indistinguishable from the
  // org not existing at all) -> 404, never a redirect, so we leak nothing about
  // whether the org is real. That bubbles to the root not-found (the generic
  // 404), since the shell never renders for a non-member. An API failure throws
  // to the nearest error boundary instead of being mistaken for either.
  const { session, me, org } = await getOrgContext(slug);

  // Org security policy. The API is authoritative (it enforces 2FA/SSO on every
  // org-scoped request, including tokens and the agent); this gate only turns the
  // API's 403 into a friendly redirect to a challenge page (which lives OUTSIDE
  // this layout so it can't loop). The API also refuses to switch a requirement
  // on for someone who doesn't meet it, so enabling one can't lock you out.
  const twoFactorEnabled = Boolean(
    (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
  );
  // Self-heal the API's mirrored 2FA state if it drifted from the auth layer's
  // (e.g. an account that enabled 2FA before the API tracked it).
  if (twoFactorEnabled !== Boolean(me.user.two_factor_enabled)) {
    await mirrorUserById(me.user.id);
  }
  if (org.enforce_two_factor && !twoFactorEnabled) {
    redirect(`/2fa-required?org=${encodeURIComponent(slug)}`);
  }

  // If this org requires SSO, members and admins must be in a session established
  // through one of its providers (the same rule the API applies). Owners are
  // exempt (break-glass): SSO can fail in ways 2FA can't, and an owner must always
  // be able to reach settings to fix or disable it.
  if (org.require_sso && org.role !== "owner") {
    const sessionProvider = (session.session as { ssoProviderId?: string | null }).ssoProviderId;
    if (!sessionProvider || !(await orgProviderIds(org.id)).includes(sessionProvider)) {
      redirect(`/sso-required?org=${encodeURIComponent(slug)}`);
    }
  }

  const user = {
    email: me.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };

  // Persisted sidebar collapse state (the provider writes this cookie on toggle).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell org={org} orgs={me.orgs} user={user} defaultSidebarOpen={sidebarOpen}>
      {children}
    </AppShell>
  );
}
