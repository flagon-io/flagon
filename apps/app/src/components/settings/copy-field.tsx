"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A labelled, read-only value with a copy button — for the service-provider URLs
 * an admin pastes into their IdP (ACS URL, Entity ID, SCIM base URL). Monospace,
 * horizontally scrollable so long URLs never break the layout.
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-200">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition hover:border-white/20"
        >
          {copied ? (
            <Check className="size-3.5 text-teal-300" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
