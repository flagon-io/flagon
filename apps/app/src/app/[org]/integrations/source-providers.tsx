"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import { Button, IconGitHub } from "@flagon/design";
import { SettingsSection } from "@/components/settings/section";
import { disconnectGithubAction, githubInstallUrlAction } from "./actions";
import type { GithubInstallation } from "@/lib/projects-api";

/** The source providers we intend to support. Only GitHub is live today. */
const PROVIDERS = [
  { key: "github", label: "GitHub", live: true, icon: IconGitHub },
  { key: "gitlab", label: "GitLab", live: false, icon: GitBranch },
  { key: "bitbucket", label: "Bitbucket", live: false, icon: GitBranch },
] as const;

/**
 * Source providers: connect a provider's App so projects can build on its
 * repositories. Provider-neutral by design — GitHub today, other hosted or
 * self-hosted providers later. Deliberately scoped: the connection only grants
 * repository access for Projects. Other GitHub-powered features (should we add
 * them) install their own, separate apps and show up as their own integrations.
 */
export function SourceProviders({
  slug,
  installations,
  canManage,
}: {
  slug: string;
  installations: GithubInstallation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    start(async () => {
      const res = await githubInstallUrlAction(slug);
      if (res.error) return setError(res.error);
      if (res.url) window.location.href = res.url;
    });
  }

  function disconnect(id: string) {
    setError(null);
    start(async () => {
      const res = await disconnectGithubAction(slug, id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <SettingsSection
      title="Source providers"
      description="Connect a source provider so your projects can build on its repositories. This connection only grants repository access for Projects."
    >
      <div className="flex flex-col gap-4">
        {/* Providers. GitHub is live; the rest advertise where we're heading. */}
        <ul className="grid gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            return (
              <li
                key={p.key}
                className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5"
              >
                <Icon className="h-4.5 w-4.5 shrink-0 text-zinc-400" />
                <span className="flex-1 text-sm text-zinc-200">{p.label}</span>
                {p.live ? (
                  canManage ? (
                    <Button variant="secondary" size="sm" onClick={connect} disabled={pending}>
                      <Plus className="h-3.5 w-3.5" /> Connect
                    </Button>
                  ) : null
                ) : (
                  <SoonPill />
                )}
              </li>
            );
          })}
        </ul>

        {/* Connected GitHub accounts. */}
        {installations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {inst.accountAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inst.accountAvatarUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full"
                    />
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400">
                      <IconGitHub className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{inst.accountLogin}</p>
                    <p className="text-xs text-zinc-500">
                      GitHub · {inst.accountType}
                      {inst.suspended ? " · suspended" : ""}
                    </p>
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => disconnect(inst.id)}
                    disabled={pending}
                    title="Disconnect"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No providers connected yet.
            {canManage ? " Connect one above to create projects from your repositories." : ""}
          </p>
        )}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {installations.length > 0 && canManage ? (
          <p className="text-xs text-zinc-600">
            Disconnecting forgets the connection here. To fully revoke access,
            uninstall the app from GitHub.
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function SoonPill() {
  return (
    <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
      Soon
    </span>
  );
}
