"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Braces, CaseSensitive, Hash, Search, ToggleLeft } from "lucide-react";
import { Input } from "@flagon/design";
import { FlagActions } from "../[key]/flag-actions";
import type { FlagSummary, FlagType } from "@/lib/flags-api";

const TYPE_ICON: Record<FlagType, typeof ToggleLeft> = {
  boolean: ToggleLeft,
  string: CaseSensitive,
  number: Hash,
  json: Braces,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function ArchiveList({ slug, flags }: { slug: string; flags: FlagSummary[] }) {
  const [q, setQ] = useState("");

  const filtered = flags.filter(
    (f) =>
      q === "" ||
      f.key.toLowerCase().includes(q.toLowerCase()) ||
      (f.description ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-6 py-20 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Archive className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">No archived flags</p>
          <p className="mt-1 text-sm text-zinc-500">
            Archive a flag from its page to retire it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search archived flags…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
          No archived flags match your search.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {filtered.map((flag, i) => {
            const Icon = TYPE_ICON[flag.type];
            return (
              <div
                key={flag.id}
                className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/3 ${
                  i > 0 ? "border-t border-white/8" : ""
                }`}
              >
                <Link
                  href={`/${slug}/flags/${flag.key}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="truncate font-mono text-sm text-zinc-300">{flag.key}</span>
                  {(flag.tags ?? []).slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="hidden shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline"
                    >
                      {t}
                    </span>
                  ))}
                </Link>
                <span className="hidden whitespace-nowrap text-xs text-zinc-600 sm:block">
                  Archived {relativeTime(flag.archivedAt)}
                </span>
                <FlagActions
                  slug={slug}
                  flagKey={flag.key}
                  archived
                  afterDeleteHref={`/${slug}/flags/archive`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
