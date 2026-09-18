"use client";

import { Sparkles } from "lucide-react";
import { Badge, cn } from "@flagon-io/ui";
import { useAgent } from "./agent-provider";

/** Topbar toggle for the Ask AI panel. */
export function AskAiButton() {
  const { open, setOpen, hasOrg } = useAgent();
  if (!hasOrg) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
        open
          ? "border-brand/40 bg-brand/10 text-brand-bright"
          : "border-hairline text-muted-foreground hover:bg-panel hover:text-foreground",
      )}
    >
      <Sparkles className="size-4" />
      <span className="hidden sm:inline">Ask AI</span>
      <Badge variant="outline" className="hidden md:inline-flex">
        Beta
      </Badge>
    </button>
  );
}
