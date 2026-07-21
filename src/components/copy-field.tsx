"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { Button, Input } from "./form-controls";

export function CopyField({
  value,
  label = "Value",
  className,
  tone = "default",
  masked = false,
}: {
  value: string;
  label?: string;
  className?: string;
  tone?: "default" | "warning";
  masked?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [revealed, setRevealed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }
  const warning = tone === "warning";
  return (
    <div
      className={`flex overflow-hidden rounded-md border ${warning ? "border-amber-500/35 bg-amber-500/5" : "border-white/10 bg-black/20"} ${className ?? ""}`}
    >
      <Input
        readOnly
        value={value}
        type={masked && !revealed ? "password" : "text"}
        autoComplete="off"
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className={`min-w-0 flex-1 rounded-none border-0 bg-transparent font-mono text-xs focus:ring-0 ${warning ? "text-amber-100" : "text-zinc-300"}`}
      />
      {masked ? (
        <Button
          variant="bare"
          onClick={() => setRevealed((value) => !value)}
          aria-label={
            revealed
              ? `Hide ${label.toLowerCase()}`
              : `Reveal ${label.toLowerCase()}`
          }
          className="shrink-0 rounded-none border-l border-white/10 px-3"
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      ) : null}
      <Button
        variant="bare"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className={`shrink-0 rounded-none border-l px-3 ${warning ? "border-amber-500/25 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200" : "border-white/10"}`}
      >
        {status === "copied" ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        <span className="ml-2 text-xs">
          {status === "copied"
            ? "Copied"
            : status === "error"
              ? "Try again"
              : "Copy"}
        </span>
      </Button>
      <span className="sr-only" aria-live="polite">
        {status === "copied"
          ? `${label} copied to clipboard.`
          : status === "error"
            ? `Could not copy ${label.toLowerCase()}.`
            : ""}
      </span>
    </div>
  );
}
