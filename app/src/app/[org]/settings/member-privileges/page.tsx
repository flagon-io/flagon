import { redirect } from "next/navigation";
import { getOrgSecurity } from "@/lib/flagon-api";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { BasePermissionForm } from "@/components/orgs/base-permission-form";

export default async function MemberPrivilegesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { role } = await getOrgContext(slug);
  if (!isOrgAdmin(role)) redirect(`/${slug}/settings`);

  const security = await getOrgSecurity(slug);

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
