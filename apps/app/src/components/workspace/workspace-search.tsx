"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { OrgMembership } from "@/lib/org";
import { getWorkspaceSearchIndex, type SearchRecord } from "./search-actions";

/**
 * The workspace search (Vercel "Find"). A trigger styled as a search field opens
 * a cmdk command palette; ⌘K / Ctrl+K toggles it from anywhere. It searches REAL
 * records (flags, experiments, segments, projects) — loaded once on first open and
 * fuzzy-filtered by cmdk — plus static destinations and org switching.
 */
export function WorkspaceSearch({
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
  const [records, setRecords] = useState<SearchRecord[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Load the record index for the active org (once, lazily). Best-effort: on
  // failure the palette still works for navigation. Called when the palette opens,
  // and re-loads if the active org changed since the last load.
  function ensureIndex() {
    if (loadingRecords || loadedFor === current.slug) return;
    setLoadingRecords(true);
    getWorkspaceSearchIndex(current.slug)
      .then((r) => {
        setRecords(r);
        setLoadedFor(current.slug);
      })
      .catch(() => {
        setRecords([]);
        setLoadedFor(current.slug);
      })
      .finally(() => setLoadingRecords(false));
  }

  function openPalette() {
    ensureIndex();
    setOpen(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ensureIndex(); // idempotent: loads once, no-ops when already loaded
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // ensureIndex reads the latest slug/loaded state via the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.slug, loadedFor, loadingRecords]);

  const GROUPS: SearchRecord["group"][] = ["Flags", "Experiments", "Segments", "Projects"];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function switchOrg(org: OrgMembership) {
    setOpen(false);
    if (org.id !== current.id) {
      await authClient.organization.setActive({ organizationId: org.id });
    }
    router.push(`/${org.slug}`);
    router.refresh();
  }

  const base = `/${current.slug}`;
  const goItems = [
    { label: "Projects", href: base },
    { label: "Flags", href: `${base}/flags` },
    { label: "Organization settings", href: `${base}/settings` },
    { label: "Members", href: `${base}/settings/members` },
    { label: "Invitations", href: `${base}/settings/invitations` },
    { label: "Authentication security", href: `${base}/settings/security` },
    { label: "Organization tokens", href: `${base}/settings/tokens` },
    { label: "Your settings", href: "/settings" },
    { label: "Emails", href: "/settings/emails" },
    { label: "Security", href: "/settings/security" },
    { label: "Personal access tokens", href: "/settings/tokens" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        title="Search (Ctrl/⌘ K)"
        className={`flex w-full items-center rounded-md border border-white/10 bg-white/5 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300 ${
          collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2"
        }`}
      >
        <Search className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1 text-left text-sm">Find…</span>
            <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ⌘K
            </kbd>
          </>
        ) : null}
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search"
        className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur"
      >
        <Command.Input
          placeholder="Find…"
          className="w-full border-b border-white/8 bg-transparent px-4 py-3.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-zinc-500 **:[[cmdk-group-heading]]:uppercase">
          <Command.Empty className="py-8 text-center text-sm text-zinc-500">
            {loadingRecords ? "Searching…" : "No results found."}
          </Command.Empty>

          {GROUPS.map((group) => {
            const items = (records ?? []).filter((r) => r.group === group);
            if (items.length === 0) return null;
            return (
              <Command.Group key={group} heading={group}>
                {items.map((r) => (
                  <Command.Item
                    key={`${group}:${r.href}`}
                    value={`${r.group} ${r.label} ${r.sublabel}`}
                    onSelect={() => go(r.href)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md p-2 text-sm text-zinc-200 outline-none data-[selected=true]:bg-white/8 data-[selected=true]:text-zinc-100"
                  >
                    <span className="truncate">{r.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-500">{r.sublabel}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}

          <Command.Group heading="Go to">
            {goItems.map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => go(item.href)}
                className="flex cursor-pointer items-center rounded-md p-2 text-sm text-zinc-200 outline-none data-[selected=true]:bg-white/8 data-[selected=true]:text-zinc-100"
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          {orgs.length > 1 ? (
            <Command.Group heading="Switch organization">
              {orgs.map((org) => (
                <Command.Item
                  key={org.id}
                  value={`org ${org.name} ${org.slug}`}
                  onSelect={() => switchOrg(org)}
                  className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm text-zinc-200 outline-none data-[selected=true]:bg-white/8 data-[selected=true]:text-zinc-100"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-teal-500/15 text-[10px] font-semibold text-teal-300">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                  {org.name}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
