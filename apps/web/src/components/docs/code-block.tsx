"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlight } from "sugar-high";

/** A copy-to-clipboard button, with a brief checkmark on success. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
    >
      {copied ? (
        <Check className="size-4 text-teal-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

/** The highlighted code itself — syntax-highlighted with sugar-high (a tiny,
 * dependency-free tokenizer). Token colors come from the --sh-* CSS variables
 * defined in globals.css, so highlighting runs at render (SSR included). */
export function Code({ code }: { code: string }) {
  const html = useMemo(() => highlight(code), [code]);
  return (
    <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

/**
 * A single code block: a rounded card with an optional label header and a copy
 * button. MDX fenced code routes here via the `pre` mapping in mdx-components.
 */
export function CodeBlock({ raw, label }: { raw: string; label?: string }) {
  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {label ? (
        <div className="flex items-center justify-between border-b border-white/10 py-1.5 pr-2 pl-4 text-xs font-medium text-zinc-500">
          <span>{label}</span>
          <CopyButton text={raw} />
        </div>
      ) : (
        <div className="absolute top-2 right-2 z-10 opacity-0 transition group-hover:opacity-100">
          <CopyButton text={raw} />
        </div>
      )}
      <Code code={raw} />
    </div>
  );
}
