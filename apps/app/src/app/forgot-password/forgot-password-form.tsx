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
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO(auth): replace with the real password-reset request.
    setSubmitted(true);
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

      <button type="submit" className={submitButtonClass}>
        Send reset link
      </button>

      {submitted ? (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-300">
          {`Password reset isn't live yet. ${brand.launch.label}.`}
        </p>
      ) : null}
    </form>
  );
}
