import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { TokensList } from "@/components/settings/tokens-list";
import { PageBody } from "@/components/shell/page-header";

export default async function OrgApiTokensPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { role } = await getOrgContext(slug);
  const canManage = isOrgAdmin(role);

  return (
    <PageBody>
      <div className="mb-5 max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Access tokens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Machine tokens that act within this organization with a fixed role. They belong to the
          org, not to any person, and keep working if the creator leaves.
        </p>
      </div>
      {canManage ? (
        <TokensList basePath={`/api/orgs/${slug}/tokens`} newHref={`/${slug}/settings/tokens/new`} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can manage organization access tokens.
        </p>
      )}
    </PageBody>
  );
}
