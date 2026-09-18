import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { TokenCreateForm } from "@/components/settings/token-create-form";
import { PageHeader, PageBody } from "@/components/shell/page-header";

export default async function NewOrgTokenPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "member";
  if (role !== "owner" && role !== "admin") redirect(`/${slug}/settings/tokens`);

  return (
    <>
      <PageHeader
        title="New organization access token"
        description="A machine token for this organization. Pick its role, what it can do, and an expiration."
      />
      <PageBody>
        <TokenCreateForm
          basePath={`/api/orgs/${slug}/tokens`}
          kind="oat"
          backHref={`/${slug}/settings/tokens`}
        />
      </PageBody>
    </>
  );
}
