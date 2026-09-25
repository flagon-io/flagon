import { getOrgContext } from "@/lib/org-context";
import { MembersManager } from "@/components/orgs/members-manager";
import { PageBody } from "@/components/shell/page-header";

export default async function PeoplePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { me, role } = await getOrgContext(slug);

  return (
    <PageBody>
      <MembersManager slug={slug} currentUserId={me.user.id} currentRole={role} />
    </PageBody>
  );
}
