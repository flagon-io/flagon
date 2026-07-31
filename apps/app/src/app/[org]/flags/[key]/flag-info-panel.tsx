"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Input, Select } from "@flagon/design";
import { updateFlagMetaAction } from "../actions";
import type { FlagSummary, Member } from "@/lib/flags-api";

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function FlagInfoPanel({
  slug,
  flag,
  members,
  readOnly = false,
}: {
  slug: string;
  flag: FlagSummary;
  members: Member[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(body: Parameters<typeof updateFlagMetaAction>[2]) {
    start(async () => {
      const res = await updateFlagMetaAction(slug, flag.key, body);
      if (!res.error) router.refresh();
    });
  }

  return (
    <>
      <Row label="Created">
        <p className="text-sm text-zinc-300">
          {flag.createdByName || "Unknown"}
          <span className="text-zinc-600">, {relativeTime(flag.createdAt)}</span>
        </p>
      </Row>

      <Row label="Maintainer">
        <Select
          value={flag.maintainerUserId ?? ""}
          onValueChange={(v) => save({ maintainerUserId: v || null })}
          disabled={pending || readOnly}
          ariaLabel="Maintainer"
          className="w-full"
          options={[
            { value: "", label: "No maintainer" },
            ...members.map((m) => ({ value: m.userId, label: m.name })),
          ]}
        />
      </Row>

      <Row label="Tags">
        <TagEditor
          tags={flag.tags}
          disabled={pending}
          readOnly={readOnly}
          onChange={(tags) => save({ tags })}
        />
      </Row>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-zinc-400">{label}</p>
      {children}
    </div>
  );
}

function TagEditor({
  tags,
  disabled,
  readOnly,
  onChange,
}: {
  tags: string[];
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  function add() {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue("");
    setAdding(false);
  }

  // Archived flag: show tags as plain, unremovable chips (or a dash if none).
  if (readOnly) {
    return tags.length === 0 ? (
      <p className="text-sm text-zinc-500">—</p>
    ) : (
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400"
          >
            {t}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-300"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            disabled={disabled}
            className="text-zinc-500 hover:text-red-400"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape") setAdding(false);
          }}
          onBlur={add}
          placeholder="tag"
          className="h-7 w-24 px-2 py-0.5 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <Plus className="size-3" /> Add
        </button>
      )}
    </div>
  );
}
