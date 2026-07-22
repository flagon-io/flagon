"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondAction } from "./actions";

/**
 * Approve / decline controls for a pending proposal. On success it refreshes
 * the server component, which re-reads the now-answered status and swaps these
 * controls for the outcome banner.
 */
export function ProposalActions({ token }: { token: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(decision: "accept" | "decline") {
    setError(null);
    startTransition(async () => {
      const result = await respondAction({
        token,
        decision,
        reason: decision === "decline" ? reason : undefined,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.reason);
      }
    });
  }

  if (declining) {
    return (
      <div className="space-y-3">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Anything you'd like us to know (optional)"
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => respond("decline")}
            disabled={pending}
            className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-40"
          >
            {pending ? "Sending…" : "Confirm decline"}
          </button>
          <button
            type="button"
            onClick={() => setDeclining(false)}
            disabled={pending}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Back
          </button>
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={pending}
          className="rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:opacity-40"
        >
          {pending ? "Submitting…" : "Approve proposal"}
        </button>
        <button
          type="button"
          onClick={() => setDeclining(true)}
          disabled={pending}
          className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
        >
          Decline
        </button>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
