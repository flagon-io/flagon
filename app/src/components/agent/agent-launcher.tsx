"use client";

import { useEffect, useState } from "react";
import { Sparkles, Compass, Building2, BookOpen, ArrowUp, type LucideIcon } from "lucide-react";
import { useAgent } from "./agent-provider";

type Prompt = { icon: LucideIcon; title: string; subtitle: string; prompt: string };

// Lean on what the agent is genuinely good at today: answering questions from
// the docs and reading your account state, rather than one-off mutation flows.
const PROMPTS: Prompt[] = [
  { icon: Sparkles, title: "What can you do?", subtitle: "See how Flagon can help", prompt: "What can you help me with?" },
  { icon: Compass, title: "Show me around", subtitle: "How Flagon is organized", prompt: "Give me a quick tour of how Flagon is organized." },
  { icon: Building2, title: "My organizations", subtitle: "Where I belong and my role", prompt: "Which organizations am I in, and what is my role in each?" },
  { icon: BookOpen, title: "How projects work", subtitle: "Read it from the docs", prompt: "How do projects work in Flagon?" },
];

function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The dashboard hero: a time-aware greeting and a gateway into the Ask AI panel.
 * Submitting or picking a suggestion opens the persistent panel and sends the
 * message there.
 */
export function AgentLauncher({ name }: { name?: string | null }) {
  const { send } = useAgent();
  const [input, setInput] = useState("");
  // Computed after mount so it uses the viewer's local time, not the server's.
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    // One-time, client-only read of the viewer's local time for the greeting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  const firstName = name?.trim().split(/\s+/)[0];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  }

  return (
    <div className="py-10 md:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {greeting ? `${greeting}${firstName ? `, ${firstName}` : ""}.` : "Let’s get to work."}
        </h1>
        <p className="mt-2.5 text-base text-muted-foreground">What are we building today?</p>
      </div>

      <form onSubmit={submit} className="relative mx-auto mt-8 max-w-2xl">
        <Sparkles className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-brand-bright" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Flagon to do something, or search..."
          autoComplete="off"
          className="h-14 w-full rounded-2xl border border-hairline bg-card py-4 pr-14 pl-11 text-[15px] text-foreground shadow-sm outline-none transition focus-visible:border-brand/50 focus-visible:ring-4 focus-visible:ring-brand/10"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Ask"
          className="absolute top-1/2 right-2.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
        >
          <ArrowUp className="size-4.5" />
        </button>
      </form>

      <div className="mx-auto mt-4 grid max-w-2xl gap-2.5 sm:grid-cols-2">
        {PROMPTS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.title}
              type="button"
              onClick={() => void send(p.prompt)}
              className="group flex items-center gap-3 rounded-xl border border-hairline bg-card px-3.5 py-3 text-left outline-none transition-colors hover:border-brand/30 hover:bg-panel focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{p.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
