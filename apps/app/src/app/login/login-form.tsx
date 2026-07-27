"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { brand } from "@flagon/design";
import { Field, submitButtonClass } from "@/components/field";

/**
 * The sign-in form.
 *
 * The UI is real and modeled on GitHub's: an identifier + password, with the
 * "Forgot password?" link sitting on the password label. There is no auth
 * backend yet, so submitting surfaces an honest "not live yet" notice rather
 * than pretending to sign anyone in. When auth lands, handleSubmit swaps for
 * the real call and the markup doesn't change.
 */
export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    // TODO(auth): await the real sign-in call here. `pending` already drives the
    // button's disabled state and label, so wiring it is a one-line swap.
    setSubmitted(true);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="identifier"
        label="Email or username"
        type="text"
        name="identifier"
        required
        autoComplete="username"
        placeholder="you@company.com"
      />
      <Field
        id="password"
        label="Password"
        type="password"
        name="password"
        required
        autoComplete="current-password"
        placeholder="••••••••"
        aside={
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
          >
            Forgot password?
          </Link>
        }
      />

      <button type="submit" className={submitButtonClass} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {submitted ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-300"
        >
          {`Sign-in isn't live yet. ${brand.launch.label}.`}
        </p>
      ) : null}
    </form>
  );
}
