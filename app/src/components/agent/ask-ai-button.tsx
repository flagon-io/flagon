"use client";

import { Sparkles } from "lucide-react";
import { Badge, Toggle } from "@flagon-io/ui";
import { useAgent } from "./agent-provider";

/** Topbar toggle for the Ask AI panel. */
export function AskAiButton() {
  const { open, setOpen, hasOrg } = useAgent();
  if (!hasOrg) return null;

  return (
    <Toggle
      size="sm"
      pressed={open}
      onPressedChange={setOpen}
      aria-label="Ask AI"
      className="gap-1.5 data-[state=on]:border-brand/40 data-[state=on]:bg-brand/10 data-[state=on]:text-brand-bright"
    >
      <Sparkles className="size-4" />
      <span className="hidden sm:inline">Ask AI</span>
      <Badge variant="outline" className="hidden md:inline-flex">
        Beta
      </Badge>
    </Toggle>
  );
}
