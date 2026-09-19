import { redirect, notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getMe } from "@/lib/flagon-api";
import { auth } from "@/lib/auth";
import { userHasSSOForOrg } from "@/lib/sso-admin";
import { AppShell } from "@/components/shell/app-shell";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  const me = await getMe();
  if (!me) redirect("/login");

  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) {
    // Not a member of this slug - which is indistinguishable here from the org not
    // existing at all. 404 (never redirect) so we leak nothing about whether the
    // org is real. This bubbles to the root not-found (the generic 404), since the
    // shell never renders for a non-member.
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });

  // Org security policy: if this org requires 2FA and the member hasn't enabled it,
  // send them to the challenge page (which lives OUTSIDE this layout so it can't
  // loop through the gate). The settings page won't let an owner turn on the
  // requirement without their own 2FA on, so enabling it can't lock them out.
  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );
  if (org.enforce_two_factor && !twoFactorEnabled) {
    redirect(`/2fa-required?org=${encodeURIComponent(slug)}`);
  }

  // If this org requires SSO, members and admins must have signed in through its
  // provider. Owners are exempt (break-glass): SSO linking can fail in ways 2FA
  // can't, and an owner must always be able to reach settings to fix or disable it.
  // The settings page only lets you turn the requirement on once your own SSO is
  // linked, so enabling it can't lock out the person who enabled it.
  if (org.require_sso && org.role !== "owner" && !(await userHasSSOForOrg(me.user.id, org.id))) {
    redirect(`/sso-required?org=${encodeURIComponent(slug)}`);
  }

  const user = {
    email: me.user.email,
    name: session?.user?.name ?? null,
    image: session?.user?.image ?? null,
  };

  // Persisted sidebar collapse state (the provider writes this cookie on toggle).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell org={org} orgs={me.orgs} user={user} defaultSidebarOpen={sidebarOpen}>
      {children}
    </AppShell>
  );
}
