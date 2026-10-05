"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A one-line shell command with a copy button. The command stays selectable
 * text, so copying by hand works too; the button is a shortcut, and it says
 * what happened to screen readers through a polite live region.
 */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the text is
      // still there to select by hand.
    }
  }

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-hairline bg-panel">
      <pre className="min-w-0 flex-1 overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed">
        <span className="select-none text-subtle" aria-hidden>
          ${" "}
        </span>
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center gap-1.5 border-l border-hairline px-4 text-xs font-medium text-muted-foreground outline-none transition hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        {copied ? (
          <Check className="h-4 w-4 text-brand" strokeWidth={2} aria-hidden />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Command copied to clipboard" : ""}
      </span>
    </div>
  );
}
