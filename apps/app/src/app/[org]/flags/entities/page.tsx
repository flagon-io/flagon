import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listEntities } from "@/lib/flags-api";
import { EntitiesManager } from "./entities-manager";

/**
 * Entities — the subjects flags evaluate for (user, team, ...) and their typed
 * attributes. Targeting rules and segments reference these attributes.
 */
export default async function EntitiesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const entities = await listEntities(slug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Entities</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The subjects you target, and the attributes your SDK sends about them.
        </p>
      </div>
      <EntitiesManager
        slug={slug}
        entities={entities}
        canManage={canManageOrg(membership.role)}
      />
    </div>
  );
}
