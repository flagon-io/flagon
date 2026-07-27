"use client";

import { useState, type FormEvent } from "react";
import { API_URL } from "@/lib/api";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch(`${API_URL}/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error("request_failed");

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="w-full max-w-md rounded-lg border border-teal-500/25 bg-teal-500/5 px-5 py-4">
        <p className="text-sm font-medium text-teal-300">
          You&apos;re on the list.
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          We&apos;ll email {email || "you"} the moment your invite is ready.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
    >
      <div className="flex-1">
        <label htmlFor="waitlist-email" className="sr-only">
          Work email
        </label>
        <input
          id="waitlist-email"
          required
          type="email"
          name="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          aria-invalid={status === "error"}
          className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
        />
        {status === "error" && (
          <p className="mt-2 text-xs text-red-400">
            Something went wrong. Give it another try in a moment.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="h-10.5 shrink-0 rounded-md bg-teal-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 disabled:opacity-60"
      >
        {status === "loading" ? "Joining…" : "Get early access"}
      </button>
    </form>
  );
}
