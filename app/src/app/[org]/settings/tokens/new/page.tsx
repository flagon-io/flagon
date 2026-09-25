import { redirect } from "next/navigation";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { TokenCreateForm } from "@/components/settings/token-create-form";
import { PageBody } from "@/components/shell/page-header";

export default async function NewOrgTokenPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { role } = await getOrgContext(slug);
  if (!isOrgAdmin(role)) redirect(`/${slug}/settings/tokens`);

  return (
    <PageBody>
      <div className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          New organization access token
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A machine token for this organization. Pick its role, what it can do, and an expiration.
        </p>
      </div>
      <TokenCreateForm
        basePath={`/api/orgs/${slug}/tokens`}
        kind="oat"
        backHref={`/${slug}/settings/tokens`}
      />
    </PageBody>
  );
}
