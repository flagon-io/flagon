import type { Metadata } from "next";
import { TOKEN_SCOPE_LABELS } from "@/lib/access-tokens.server";
import { TokenManager } from "@/components/token-manager";

export const metadata: Metadata = { title: "Access tokens" };

/**
 * Personal access tokens.
 *
 * A PAT acts as YOU: it carries your organization roles, so it can never do
 * anything you could not do by hand, and it stops working the moment your
 * membership does. That makes it right for scripting against your own account
 * and wrong for a shared production service, where the credential should
 * outlive whoever set it up. Use an organization token there instead.
 */
export default function PersonalTokensPage() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Account
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Access tokens
      </h1>
      <p className="mt-1 text-sm leading-6 text-zinc-500">
        Personal credentials for the API and the CLI. They act as you: every
        organization you belong to, with the access you already have, narrowed
        by the scopes you grant. Nothing extra to configure, and no per-
        organization setup.
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-500">
        For a shared service, prefer an organization token: it survives you
        leaving and does not tie production to one person&apos;s account.
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        One exception. The OFREP evaluation endpoints have no organization in
        their URL, so a personal token has to say which one it means: send the
        organization id in{" "}
        <code className="text-zinc-400">X-Flagon-Organization</code>. Everything
        under <code className="text-zinc-400">/v1</code> already names the
        organization in the path and needs no such header.
      </p>

      <div className="mt-8">
        <TokenManager
          endpoint="/api/v1/user/tokens"
          scopeLabels={Object.entries(TOKEN_SCOPE_LABELS)}
          emptyLabel="Tokens act as you, limited to the scopes you grant."
          createLabel="Create personal access token"
          namePlaceholder="Local CLI"
        />
      </div>
    </div>
  );
}
