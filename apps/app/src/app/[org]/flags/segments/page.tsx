import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { listSegments } from "@/lib/flags-api";
import { SegmentsManager } from "./segments-manager";

/**
 * Segments — reusable groups of users, matched by attribute conditions and
 * referenced from any flag's targeting rules.
 */
export default async function SegmentsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const segments = await listSegments(slug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Segments</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reusable groups of users. Define one here, then target it from any flag.
        </p>
      </div>
      <SegmentsManager slug={slug} segments={segments} />
    </div>
  );
}
