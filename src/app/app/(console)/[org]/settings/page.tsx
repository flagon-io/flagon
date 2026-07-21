import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveOrg } from "../resolve-org";
import { OrgSettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "Organization settings" };

/** Organization settings - `app.flagon.io/<org>/settings`. Admins rename;
 * the owner changes the URL and can delete the organization. */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const [org, session] = await Promise.all([
    resolveOrg(slug),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!org || !session) notFound();

  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  if (role !== "owner" && role !== "admin") notFound();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        {org.name}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Settings
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        General settings for this organization.
      </p>

      <div className="mt-8">
        <OrgSettingsPanel
          orgSlug={slug}
          currentName={org.name}
          isOwner={role === "owner"}
        />
      </div>
    </div>
  );
}
