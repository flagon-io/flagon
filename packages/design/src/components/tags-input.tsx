"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "../cn";

/**
 * A chips/tags input: each value is a removable pill, and typing + Enter (or a
 * comma) commits a new one. For multi-value fields (e.g. a targeting "is any of")
 * where a comma-separated text box hides that it's a list. Shares the field's
 * border/focus styling so it lines up with Input and Select; it grows in height as
 * chips wrap, keeping the standard 40px minimum.
 */
export function TagsInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft("");
  };

  const removeAt = (i: number) => onChange(value.filter((_, j) => j !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "min-h-10 gap-1.5 rounded-md border-white/10 bg-white/5 px-2 py-1.5 text-sm focus-within:border-teal-500/50 focus-within:ring-teal-500/20 flex w-full flex-wrap items-center border transition-colors focus-within:ring-2",
        className,
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="gap-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-zinc-200 inline-flex items-center"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remove ${tag}`}
            className="text-zinc-400 hover:text-red-400 leading-none transition-colors"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        aria-label={ariaLabel}
        className="min-w-16 font-mono text-zinc-100 placeholder:font-sans placeholder:text-zinc-500 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}
