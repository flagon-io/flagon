import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { FLAG_ENVIRONMENTS, listSdkKeys } from "@/lib/flags-api";
import { SdkKeysManager } from "./sdk-keys-manager";

/**
 * SDK keys — per-environment client credentials used to evaluate flags over
 * OFREP. Keys are shown once at creation; only their hash is stored.
 */
export default async function SdkKeysPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const keys = await listSdkKeys(slug);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/flags`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" /> Flags
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Client Keys</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Per-environment credentials for evaluating flags with the OpenFeature OFREP provider.
        </p>
      </div>
      <SdkKeysManager
        slug={slug}
        environments={FLAG_ENVIRONMENTS}
        keys={keys}
        canManage={canManageOrg(membership.role)}
      />
    </div>
  );
}
