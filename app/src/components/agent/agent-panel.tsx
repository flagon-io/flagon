"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Loader2,
  Check,
  ShieldCheck,
  Plus,
  ArrowUp,
  Pencil,
  FastForward,
  ChevronDown,
  Maximize2,
  Minimize2,
  Square,
  Boxes,
  FileText,
  Rocket,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  cn,
} from "@flagon-io/ui";
import { useAgent } from "./agent-provider";
import { Markdown } from "./markdown";

// A full-height layout column that animates its width open/closed (like the
// sidebar), so the content beside it reflows smoothly. Expands wider on demand
// for more room to work.
export function AgentPanel() {
  const { open } = useAgent();
  const [expanded, setExpanded] = useState(false);
  const width = expanded ? "md:w-[34rem]" : "md:w-96";

  return (
    <div
      className={cn(
        "z-20 shrink-0 overflow-hidden transition-[width] duration-200 ease-linear",
        open ? cn("w-full", width) : "w-0",
      )}
      inert={!open}
      aria-hidden={!open}
    >
      {/* Fixed inner width so the content doesn't squish while the column animates. */}
      <div className={cn("flex h-full w-screen flex-col border-l border-hairline bg-background", width)}>
        <PanelBody expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} />
      </div>
    </div>
  );
}

type Starter = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  prompt: string;
  soon?: boolean;
};

// What people actually reach for: their projects and what's changed. The recap
// prompt leans on the audit log. Capabilities the platform hasn't shipped yet
// (deployments, DORA metrics) show disabled with a "Soon" tag so the surface
// advertises the direction without pretending it works.
const STARTERS: Starter[] = [
  {
    icon: Boxes,
    title: "Show me our projects",
    subtitle: "What we're building here",
    prompt: "What projects do we have in this organization?",
  },
  {
    icon: FileText,
    title: "Recap what shipped",
    subtitle: "An executive summary of recent changes",
    prompt:
      "Give me an executive summary of everything that changed in this organization recently, grouped by what happened.",
  },
  {
    icon: Sparkles,
    title: "What can you do?",
    subtitle: "See how Flagon can help",
    prompt: "What can you help me with?",
  },
  {
    icon: Rocket,
    title: "How are deploys going?",
    subtitle: "Coming soon",
    prompt: "",
    soon: true,
  },
  {
    icon: Gauge,
    title: "Show delivery metrics",
    subtitle: "Coming soon",
    prompt: "",
    soon: true,
  },
];

function PanelBody({
  expanded,
  onToggleExpand,
}: {
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const {
    setOpen,
    messages,
    proposals,
    done,
    loading,
    confirming,
    error,
    send,
    stop,
    busy,
    confirm,
    clear,
    mode,
    setMode,
  } = useAgent();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, proposals, done, confirming]);

  // Auto-grow the textarea up to a cap, then let it scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const empty = messages.length === 0;

  function doSend() {
    if (busy) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    void send(text);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    doSend();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <Sparkles className="size-4 text-brand-bright" />
        <span className="font-semibold text-foreground">Ask AI</span>
        <Badge variant="outline">Beta</Badge>
        <div className="ml-auto flex items-center gap-1">
          {!empty && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={clear}
              aria-label="New conversation"
            >
              <Plus className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse panel" : "Expand panel"}
            className="hidden size-8 md:flex"
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="dot-grid flex-1 space-y-4 overflow-y-auto p-4">
        {empty && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand/12 text-brand-bright">
              <Sparkles className="size-5" />
            </span>
            <p className="font-medium text-foreground">How can I help?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              I can act on Flagon for you - managing orgs, projects, and more.
            </p>
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
              {STARTERS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.title}
                    type="button"
                    disabled={s.soon}
                    onClick={() => {
                      if (!s.soon) void send(s.prompt);
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border border-hairline bg-card/70 px-3 py-2.5 text-left outline-none transition-colors",
                      s.soon
                        ? "cursor-not-allowed opacity-55"
                        : "hover:border-brand/40 hover:bg-panel focus-visible:ring-2 focus-visible:ring-brand",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.subtitle}</span>
                    </span>
                    {s.soon && (
                      <Badge variant="secondary" className="shrink-0 normal-case tracking-normal">
                        Soon
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <Markdown>{m.content}</Markdown>
            </div>
          ),
        )}

        {(loading || confirming) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {confirming ? "Applying changes..." : "Thinking..."}
          </div>
        )}

        {proposals.map((p, i) => (
          <div key={i} className="rounded-lg border border-brand/30 bg-brand/8 p-3">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-bright" />
              <span>
                <span className="font-medium">Confirm:</span> {p.summary}
              </span>
            </p>
            <div className="mt-2.5 flex justify-end">
              <Button size="sm" onClick={() => confirm(p)} disabled={confirming}>
                {confirming ? "Working..." : "Confirm"}
              </Button>
            </div>
          </div>
        ))}

        {done.map((s, i) => (
          <Alert key={i} variant="success" icon={<Check />}>
            Done: {s}
          </Alert>
        ))}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-hairline p-3">
        <div className="rounded-xl border border-hairline bg-card p-2 transition focus-within:ring-2 focus-within:ring-brand">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Ask Flagon to do something..."
            aria-label="Message the assistant"
            autoComplete="off"
            rows={1}
            className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-1 flex items-center justify-between">
            <ModeSelect mode={mode} setMode={setMode} />
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={stop}
                className="size-8 rounded-lg"
                aria-label="Stop"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="size-8 rounded-lg"
                aria-label="Send"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-2xs text-muted-foreground">
          The assistant can make mistakes.{" "}
          {mode === "ask" ? "It confirms before changing anything." : "It edits automatically."}
        </p>
      </form>
    </>
  );
}

function ModeSelect({
  mode,
  setMode,
}: {
  mode: "ask" | "auto";
  setMode: (m: "ask" | "auto") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-panel"
        aria-label={mode === "ask" ? "Mode: ask before editing" : "Mode: automatically edit"}
      >
        {mode === "ask" ? <Pencil className="size-3.5" /> : <FastForward className="size-3.5" />}
        {mode === "ask" ? "Ask" : "Auto"}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuItem onSelect={() => setMode("ask")} className="items-start">
          <Pencil className="mt-0.5" />
          <span className="flex-1">
            <span className="block font-medium text-foreground">Ask before editing</span>
            <span className="block text-xs text-muted-foreground">Review and approve each change</span>
          </span>
          {mode === "ask" && <Check className="mt-0.5 text-brand" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMode("auto")} className="items-start">
          <FastForward className="mt-0.5" />
          <span className="flex-1">
            <span className="block font-medium text-foreground">Automatically edit</span>
            <span className="block text-xs text-muted-foreground">
              Always allow edits for this conversation
            </span>
          </span>
          {mode === "auto" && <Check className="mt-0.5 text-brand" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
