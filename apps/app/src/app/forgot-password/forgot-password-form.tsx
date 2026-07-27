"use client";

import { useState, type FormEvent } from "react";
import { brand } from "@flagon/design";
import { Field, submitButtonClass } from "@/components/field";

/**
 * Request a password-reset link. Like the sign-in form, the UI is real but
 * there is no backend yet, so submitting surfaces an honest notice. When auth
 * lands, handleSubmit swaps for the real request and the markup doesn't change.
 */
export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    // TODO(auth): await the real password-reset request here. `pending` already
    // drives the button's disabled state and label, so wiring it is a one-line swap.
    setSubmitted(true);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="email"
        label="Email"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
      />

      <button type="submit" className={submitButtonClass} disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>

      {submitted ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-300"
        >
          {`Password reset isn't live yet. ${brand.launch.label}.`}
        </p>
      ) : null}
    </form>
  );
}
