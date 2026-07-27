"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  FlagonMark,
  Popover,
  PopoverAnchor,
  PopoverTrigger,
  PopoverContent,
} from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { planName } from "@/lib/plans";
import type { OrgMembership } from "@/lib/org";

/**
 * The organization switcher at the top of the sidebar, modeled on Vercel's team
 * switcher.
 *
 * The org name/avatar is a LINK to that org's workspace; a separate chevron
 * button opens a searchable popover (Radix Popover + cmdk), so clicking the name
 * navigates rather than opening the switcher. The popover is a "Find
 * organization" search over the user's orgs (each with its plan badge and a
 * check on the current one), with "Create organization" pinned at the bottom,
 * always taking you to create. Orgs with no logo fall back to the Flagon mark.
 */
export function OrgSwitcher({
  orgs,
  current,
  collapsed,
}: {
  orgs: OrgMembership[];
  current: OrgMembership;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function switchTo(org: OrgMembership) {
    setOpen(false);
    if (org.id !== current.id) {
      await authClient.organization.setActive({ organizationId: org.id });
    }
    router.push(`/${org.slug}`);
    router.refresh();
  }

  function createOrg() {
    setOpen(false);
    router.push("/new");
  }

  const panel = (
    <PopoverContent
      align="start"
      className="w-72 p-0"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <Command
        loop
        className="flex flex-col"
        // Match on name and slug, not the internal id.
        filter={(value, search) =>
          value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
        }
      >
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
          <Command.Input
            placeholder="Find organization…"
            className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-72 overflow-y-auto p-1.5">
          <Command.Empty className="px-2 py-6 text-center text-sm text-zinc-500">
            No organizations found.
          </Command.Empty>
          <Command.Group
            heading="Organizations"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500 [&_[cmdk-group-heading]]:uppercase"
          >
            {orgs.map((o) => (
              <Command.Item
                key={o.id}
                value={`${o.name} ${o.slug}`}
                onSelect={() => switchTo(o)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 outline-none data-[selected=true]:bg-white/8 data-[selected=true]:text-zinc-100"
              >
                <OrgAvatar org={o} />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
                  {planName(o.plan)}
                </span>
                {o.id === current.id ? (
                  <Check className="h-4 w-4 shrink-0 text-teal-400" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        {/* Create is pinned outside the scrolling/filtered list, so it is always
            visible and always takes you to create. */}
        <button
          type="button"
          onClick={createOrg}
          className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-dashed border-white/15 text-zinc-400">
            <Plus className="h-3.5 w-3.5" />
          </span>
          Create organization
        </button>
      </Command>
    </PopoverContent>
  );

  if (collapsed) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${current.name} — switch organization`}
            className="flex w-full items-center justify-center rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-teal-500/50"
          >
            <OrgAvatar org={current} />
          </button>
        </PopoverTrigger>
        {panel}
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Anchor the panel to the whole row (not the chevron), so it aligns
          under the org logo and opens rightward, Vercel-style, instead of
          hugging the sidebar's left edge. */}
      <PopoverAnchor asChild>
        <div className="flex w-full items-center gap-1">
          <Link
            href={`/${current.slug}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5"
          >
            <OrgAvatar org={current} />
            <span className="truncate text-sm font-medium text-zinc-100">
              {current.name}
            </span>
            <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
              {planName(current.plan)}
            </span>
          </Link>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Switch organization"
              className="shrink-0 rounded-md p-1.5 text-zinc-500 outline-none transition-colors hover:bg-white/5 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-teal-500/50"
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      {panel}
    </Popover>
  );
}

/** An org's avatar: its logo if set, otherwise the Flagon mark. */
function OrgAvatar({ org }: { org: { name: string; logo: string | null } }) {
  if (org.logo) {
    return (
      // A plain <img>: org logos are arbitrary remote URLs, not build-time
      // assets, so next/image's domain allowlist does not apply cleanly here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={org.logo}
        alt=""
        className="h-6 w-6 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white/5">
      <FlagonMark className="h-4 w-4" />
    </span>
  );
}
