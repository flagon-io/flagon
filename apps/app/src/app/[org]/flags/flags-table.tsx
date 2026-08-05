"use client";

import { useState } from "react";
import Link from "next/link";
import { Braces, CaseSensitive, Hash, Search, ToggleLeft } from "lucide-react";
import { Input, Select } from "@flagon/design";
import { CreateFlagButton } from "./create-flag-dialog";
import type { FlagSummary, FlagType } from "@/lib/flags-api";

const TYPE_ICON: Record<FlagType, typeof ToggleLeft> = {
  boolean: ToggleLeft,
  string: CaseSensitive,
  number: Hash,
  json: Braces,
};

const TYPE_FILTERS: { value: "all" | FlagType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "boolean", label: "Boolean" },
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "json", label: "JSON" },
];

function formatValue(type: FlagType, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? "On" : "Off";
  if (type === "string") return JSON.stringify(value);
  if (type === "number") return String(value);
  return JSON.stringify(value);
}

function relativeTime(iso: string): string {
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

// Fixed bar count so every row's sparkline is the same width and the columns
// line up, whether or not the flag has any traffic yet.
const SPARK_BARS = 14;

function normalizeSeries(series?: number[]): number[] {
  const s = series ?? [];
  if (s.length >= SPARK_BARS) return s.slice(s.length - SPARK_BARS);
  return [...Array(SPARK_BARS - s.length).fill(0), ...s];
}

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-6 w-13 shrink-0 items-end gap-px" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${v > 0 ? "bg-teal-500/60" : "bg-white/8"}`}
          style={{ height: `${v > 0 ? Math.max(18, (v / max) * 100) : 14}%` }}
        />
      ))}
    </div>
  );
}

// The usage cell always renders a chart (empty bars when there's no traffic yet)
// so the column keeps a fixed footprint and every row aligns. Shows checks/hr and,
// for boolean-like flags, the pass rate — the gate-style read Statsig surfaces.
function ChecksCell({ usage }: { usage: FlagSummary["usage"] }) {
  const cph = usage && usage.total > 0 ? usage.checksPerHour : null;
  const rate =
    cph === null ? "0/hr" : cph >= 1 ? `${Math.round(cph)}/hr` : cph > 0 ? "<1/hr" : "0/hr";
  const passRate = usage?.passRate ?? null;
  return (
    <div className="hidden items-center justify-end gap-2.5 sm:flex">
      <MiniSparkline values={normalizeSeries(usage?.series)} />
      <div className="flex w-16 shrink-0 flex-col items-end leading-tight">
        <span className="text-xs whitespace-nowrap text-zinc-400 tabular-nums">{rate}</span>
        {passRate !== null ? (
          <span className="text-[11px] whitespace-nowrap text-zinc-500 tabular-nums">
            {Math.round(passRate * 100)}% pass
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A muted "Stale" pill for flags with traffic that's gone quiet (cleanup candidate). */
function StaleBadge() {
  return (
    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/90">
      Stale
    </span>
  );
}

export function FlagsTable({
  slug,
  flags,
  initialCreate,
}: {
  slug: string;
  flags: FlagSummary[];
  initialCreate?: boolean;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | FlagType>("all");
  const [creator, setCreator] = useState("all");
  const [maintainer, setMaintainer] = useState("all");
  const [tag, setTag] = useState("all");

  const creators = [
    ...new Set(flags.map((f) => f.createdByName).filter(Boolean) as string[]),
  ].sort();
  const maintainers = [
    ...new Set(flags.map((f) => f.maintainerName).filter(Boolean) as string[]),
  ].sort();
  const tags = [...new Set(flags.flatMap((f) => f.tags ?? []))].sort();

  const filtered = flags.filter(
    (f) =>
      (type === "all" || f.type === type) &&
      (creator === "all" || f.createdByName === creator) &&
      (maintainer === "all" || f.maintainerName === maintainer) &&
      (tag === "all" || (f.tags ?? []).includes(tag)) &&
      (q === "" ||
        f.key.toLowerCase().includes(q.toLowerCase()) ||
        (f.description ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search flags…"
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) => setType(v as "all" | FlagType)}
          options={TYPE_FILTERS.map((t) => ({ value: t.value, label: t.label }))}
          ariaLabel="Filter by type"
          className="w-36 shrink-0"
        />
        {creators.length > 0 ? (
          <Select
            value={creator}
            onValueChange={setCreator}
            options={[
              { value: "all", label: "Creator" },
              ...creators.map((c) => ({ value: c, label: c })),
            ]}
            ariaLabel="Filter by creator"
            className="w-40 shrink-0"
          />
        ) : null}
        {maintainers.length > 0 ? (
          <Select
            value={maintainer}
            onValueChange={setMaintainer}
            options={[
              { value: "all", label: "Maintainer" },
              ...maintainers.map((m) => ({ value: m, label: m })),
            ]}
            ariaLabel="Filter by maintainer"
            className="w-40 shrink-0"
          />
        ) : null}
        {tags.length > 0 ? (
          <Select
            value={tag}
            onValueChange={setTag}
            options={[
              { value: "all", label: "Tags" },
              ...tags.map((t) => ({ value: t, label: t })),
            ]}
            ariaLabel="Filter by tag"
            className="w-32 shrink-0"
          />
        ) : null}
        <CreateFlagButton slug={slug} initialCreate={initialCreate} />
      </div>

      {flags.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-6 py-20 text-center">
          <span className="grid size-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
            <ToggleLeft className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-200">No flags found</p>
            <p className="mt-1 text-sm text-zinc-500">Create flags to manage feature releases.</p>
          </div>
          <CreateFlagButton slug={slug} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
          No flags match your search.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {filtered.map((flag, i) => {
            const Icon = TYPE_ICON[flag.type];
            return (
              <Link
                key={flag.id}
                href={`/${slug}/flags/${flag.key}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-white/3 sm:grid-cols-[minmax(0,1fr)_180px_160px_140px_64px] ${
                  i > 0 ? "border-t border-white/8" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon className="size-4 shrink-0 text-zinc-500" />
                  <span className="truncate font-mono text-sm text-zinc-100">{flag.key}</span>
                  {(flag.tags ?? []).slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="hidden shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline"
                    >
                      {t}
                    </span>
                  ))}
                  {flag.archivedAt ? (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500/90">
                      Archived
                    </span>
                  ) : flag.usage?.stale ? (
                    <StaleBadge />
                  ) : null}
                </div>
                <span className="hidden truncate font-mono text-sm text-zinc-400 sm:block">
                  {formatValue(flag.type, flag.value)}
                </span>
                <div className="hidden items-center gap-1.5 sm:flex">
                  {flag.createdByName ? (
                    <>
                      <span className="grid size-5 place-items-center rounded-full bg-teal-500/15 text-[10px] font-semibold text-teal-300">
                        {flag.createdByName.charAt(0).toUpperCase()}
                      </span>
                      <span className="max-w-32 truncate text-xs text-zinc-500">
                        {flag.createdByName}
                      </span>
                    </>
                  ) : null}
                </div>
                <ChecksCell usage={flag.usage} />
                <span className="text-right text-xs whitespace-nowrap text-zinc-600">
                  {relativeTime(flag.createdAt)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
