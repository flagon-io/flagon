"use client";

import { useState, type FormEvent } from "react";
import { brand } from "@flagon/design";

/**
 * The sign-in form.
 *
 * The UI is real, but there is no authentication backend yet, so submitting
 * surfaces an honest "not available yet" notice rather than pretending to log
 * anyone in. When auth lands this handler swaps for the real call; the layout
 * doesn't change.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  const inputClass =
    "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-zinc-400">
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-zinc-400">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        className="mt-1 h-10.5 rounded-md bg-teal-500 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
      >
        Sign in
      </button>

      {submitted && (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-300">
          Sign-in isn&apos;t open yet. {brand.launch.label}, and invites go out
          from there.
        </p>
      )}
    </form>
  );
}
