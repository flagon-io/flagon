"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Field, submitButtonClass } from "@/components/field";
import { FormError } from "@/components/form-error";

/**
 * Set a new password using the token from the reset link. On success we send the
 * user to sign in with a confirmation flag rather than logging them straight in,
 * so a reset always ends at a known, deliberate sign-in.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    if (error) {
      setError(error.message ?? "We could not reset your password. Request a new link.");
      setPending(false);
      return;
    }

    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="password"
        label="New password"
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="••••••••"
      />
      <Field
        id="confirm"
        label="Confirm password"
        type="password"
        name="confirm"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="••••••••"
      />

      {error ? <FormError>{error}</FormError> : null}

      <button type="submit" className={submitButtonClass} disabled={pending}>
        {pending ? "Saving…" : "Reset password"}
      </button>
    </form>
  );
}
