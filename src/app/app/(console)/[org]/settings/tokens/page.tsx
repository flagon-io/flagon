import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { TOKEN_SCOPE_LABELS } from "@/lib/access-tokens.server";
import { TokenManager } from "@/components/token-manager";
import { resolveOrg } from "../../resolve-org";

export const metadata: Metadata = { title: "API tokens" };

/**
 * Organization access tokens.
 *
 * These belong to the ORGANIZATION, not to whoever created them: they survive
 * that person leaving, occupy no seat, and appear in no member list. That is
 * the whole reason they exist, and why they replace the service-account
 * pattern rather than sitting alongside it.
 *
 * Owner and admin only, and session-only: a token can never mint another
 * token, so a leak can always be contained by a human who still has a
 * password.
 */
export default async function OrgTokensPage({
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

  const role = org.members.find(
    (member) => member.userId === session.user.id,
  )?.role;
  const canManage = role === "owner" || role === "admin";

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        {org.name}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        API tokens
      </h1>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
        Secret credentials that belong to this organization. Use them for
        servers, jobs, and CI, so automation does not depend on any one
        person&apos;s account. Most applications only evaluate flags and should
        use a publishable client token instead, created on the Feature Flags
        page.
      </p>

      <div className="mt-8">
        {canManage ? (
          <TokenManager
            endpoint={`/api/v1/orgs/${slug}/tokens`}
            scopeLabels={Object.entries(TOKEN_SCOPE_LABELS)}
            defaultScopes={["flags:evaluate"]}
            emptyLabel="Tokens act as the organization, with the scopes you grant."
            createLabel="Create organization token"
            namePlaceholder="Production server"
          />
        ) : (
          <p className="border border-white/10 px-4 py-6 text-center text-sm text-zinc-600">
            Organization owners and admins manage API tokens.
          </p>
        )}
      </div>
    </div>
  );
}
