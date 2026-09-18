"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { useAgent } from "./agent-provider";

function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The dashboard hero: a time-aware greeting and a roomy gateway into the Ask AI
 * panel. Submitting opens the persistent panel and sends the message there.
 * Suggested prompts live in the Ask AI panel, not here, so the hero stays calm.
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
    <div className="w-full max-w-3xl">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {greeting ? `${greeting}${firstName ? `, ${firstName}` : ""}.` : "Let’s get to work."}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">What are we building today?</p>
      </div>

      <form onSubmit={submit} className="relative mx-auto mt-10 w-full max-w-3xl">
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
    </div>
  );
}
