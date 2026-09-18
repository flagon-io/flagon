"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@flagon-io/ui";
import { highlight } from "./highlight";

export function CodeBlock({
  code,
  lang = "tsx",
  className,
}: {
  code: string;
  lang?: "tsx" | "bash" | "css";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    highlight(code, lang)
      .then((h) => {
        if (active) setHtml(h);
      })
      .catch(() => {
        /* fall back to plain text */
      });
    return () => {
      active = false;
    };
  }, [code, lang]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-hairline bg-card", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition hover:bg-panel hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
      </button>

      {html ? (
        <div
          className="overflow-x-auto p-4 text-[13px] leading-relaxed [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-foreground">
          <code className="font-mono">{code}</code>
        </pre>
      )}
    </div>
  );
}
