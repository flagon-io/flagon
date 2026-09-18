import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { MembersManager } from "@/components/orgs/members-manager";
import { PageBody } from "@/components/shell/page-header";

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const org = me?.orgs.find((o) => o.slug === slug);
  const role = org?.role ?? "member";

  return (
    <PageBody>
      <MembersManager slug={slug} currentUserId={me?.user.id ?? ""} currentRole={role} />
    </PageBody>
  );
}
