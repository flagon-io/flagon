"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A code block with a copy button and an optional language/file label. Purely
 * presentational (no build-time highlighter) so the MDX pipeline stays
 * plugin-free; monochrome code reads cleanly on the near-black surface.
 *
 * `raw` is the exact text copied to the clipboard; `children` is what renders
 * (usually the same string). MDX fenced code routes through here via the `pre`
 * mapping in mdx-components.
 */
export function CodeBlock({
  raw,
  label,
  children,
}: {
  raw: string;
  label?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {label ? (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs font-medium text-zinc-500">
          <span>{label}</span>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => {
          navigator.clipboard.writeText(raw);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-zinc-900/80 text-zinc-400 opacity-0 transition hover:bg-white/5 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
      >
        {copied ? (
          <Check className="h-4 w-4 text-teal-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-200">
        {children ?? raw}
      </pre>
    </div>
  );
}
