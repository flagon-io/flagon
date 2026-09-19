import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getOrgSecurity, type OrgSecurity } from "@/lib/flagon-api";
import { BasePermissionForm } from "@/components/orgs/base-permission-form";

export default async function MemberPrivilegesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const [me, session] = await Promise.all([
    getMe().catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session || !me) redirect("/login");
  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/${slug}/settings`);

  const security = await getOrgSecurity(slug).catch(
    () => ({ enforce_two_factor: false, require_sso: false, base_permission: "read" }) as OrgSecurity,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Member privileges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The default access members have across this organization&rsquo;s projects.
        </p>
      </div>
      <BasePermissionForm slug={slug} basePermission={security.base_permission} />
    </div>
  );
}
