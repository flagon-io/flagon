import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getMe } from "@/lib/flagon-api";
import { auth } from "@/lib/auth";
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
    // Not a member of this slug (or it doesn't exist): send them somewhere real.
    redirect(me.orgs.length > 0 ? `/${me.orgs[0].slug}` : "/new");
  }

  const session = await auth.api.getSession({ headers: await headers() });
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
