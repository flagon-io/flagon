"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Field, submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";

/**
 * Request a password-reset link. The response is deliberately the same whether
 * or not the address has an account, so the form never reveals who is
 * registered: on success we always show the same "check your email" notice.
 */
export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setPending(false);
    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <FormNotice>
        If an account exists for that address, a reset link is on its way. Check
        your inbox and spam folder.
      </FormNotice>
    );
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

      {error ? <FormError>{error}</FormError> : null}

      <button type="submit" className={submitButtonClass} disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
