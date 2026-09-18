"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type AgentMsg = { role: "user" | "assistant"; content: string };
export type AgentProposal = { tool: string; input: unknown; summary: string };
export type AgentMode = "ask" | "auto";

/** A request the user aborted (via stop). Swallowed, not surfaced as an error. */
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

type AgentContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  hasOrg: boolean;
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
  messages: AgentMsg[];
  proposals: AgentProposal[];
  done: string[];
  loading: boolean;
  confirming: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  confirm: (p: AgentProposal) => Promise<void>;
  stop: () => void;
  busy: boolean;
  clear: () => void;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within an AgentProvider");
  return ctx;
}

// Holds the conversation + panel state above the router, so the chat "comes with
// you" as you navigate the org. Scoped to one org (resets when the org changes).
export function AgentProvider({ orgId, children }: { orgId: string | null; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AgentMode>("ask");
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks the in-flight request so stop() can abort it.
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runProposal = useCallback(
    async (p: AgentProposal) => {
      if (!orgId) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch("/api/ai/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, tool: p.tool, input: p.input }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The action could not be completed.");
      setDone((d) => [...d, p.summary]);
      setProposals((ps) => ps.filter((x) => x !== p));
      router.refresh();
    },
    [orgId, router],
  );

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading || !orgId) return;
      setError(null);
      setProposals([]);
      setOpen(true);
      const next: AgentMsg[] = [...messages, { role: "user", content: q }];
      setMessages(next);
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/ai/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, messages: next }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "The assistant is unavailable.");
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        const props: AgentProposal[] = data.proposals ?? [];
        // Automatic mode: run proposed actions without asking. Ask mode: hold
        // them for the user to confirm.
        if (mode === "auto" && props.length) {
          setConfirming(true);
          try {
            for (const p of props) await runProposal(p);
          } finally {
            setConfirming(false);
          }
        } else {
          setProposals(props);
        }
      } catch (e) {
        // A user-initiated stop is not an error; leave the conversation as-is.
        if (!isAbort(e)) setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [messages, loading, orgId, mode, runProposal],
  );

  const confirm = useCallback(
    async (p: AgentProposal) => {
      setConfirming(true);
      setError(null);
      try {
        await runProposal(p);
      } catch (e) {
        if (!isAbort(e)) {
          setError(e instanceof Error ? e.message : "The action could not be completed.");
        }
      } finally {
        setConfirming(false);
      }
    },
    [runProposal],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setProposals([]);
    setDone([]);
    setError(null);
  }, []);

  return (
    <AgentContext.Provider
      value={{
        open,
        setOpen,
        hasOrg: Boolean(orgId),
        mode,
        setMode,
        messages,
        proposals,
        done,
        loading,
        confirming,
        error,
        send,
        confirm,
        stop,
        busy: loading || confirming,
        clear,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
