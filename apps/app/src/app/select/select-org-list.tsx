"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { planName } from "@/lib/plans";
import type { OrgMembership } from "@/lib/org";

/**
 * Lists the user's organizations. Picking one records it as the active org (so
 * next time they land straight in it) and opens its workspace.
 */
export function SelectOrgList({ orgs }: { orgs: OrgMembership[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function open(org: OrgMembership) {
    setBusy(org.id);
    await authClient.organization.setActive({ organizationId: org.id });
    router.push(`/${org.slug}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {orgs.map((org) => (
          <li key={org.id}>
            <button
              type="button"
              onClick={() => open(org)}
              disabled={busy !== null}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/2 px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-teal-500/15 text-sm font-semibold text-teal-300">
                  {org.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-zinc-100">
                    {org.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    app.flagon.io/{org.slug} · {planName(org.plan)} · {org.role}
                  </span>
                </span>
              </span>
              <span className="text-xs text-zinc-500">
                {busy === org.id ? "Opening…" : "Open"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/new"
        className="rounded-lg border border-dashed border-white/15 px-4 py-3 text-center text-sm text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
      >
        Create a new organization
      </Link>
    </div>
  );
}
