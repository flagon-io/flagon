import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listFlags } from "@/lib/flags-api";
import { ArchiveList } from "./archive-list";

/**
 * Archived flags. Archiving retires a flag from the working set without breaking
 * anything: an archived flag STILL evaluates to its configured value for code
 * that references it, so you can archive first and clean up the code after. Only
 * deleting a flag stops evaluation. Restore or permanently delete from here.
 */
export default async function ArchivedFlagsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const flags = await listFlags(slug, { archived: "only" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Archive</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Retired flags. They still evaluate for any code that references them, so
          nothing breaks. Restore one to bring it back, or delete it permanently to
          stop evaluation for good.
        </p>
      </div>
      <ArchiveList
        slug={slug}
        flags={flags}
        canManage={canManageOrg(membership.role)}
      />
    </div>
  );
}
