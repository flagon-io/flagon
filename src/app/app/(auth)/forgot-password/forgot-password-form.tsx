"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordResetAction } from "../actions";
import {
  AuthAltCard,
  AuthCard,
  AuthTitle,
  Notice,
  inputClass,
  labelClass,
  linkClass,
  primaryButtonClass,
  useAuthBase,
} from "../ui";

export function ForgotPasswordForm({
  emailConfigured,
}: {
  emailConfigured: boolean;
}) {
  const base = useAuthBase();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    // Server action: any of the account's emails resolves to its primary, so
    // the reset link reaches the user whichever address they typed.
    const result = await requestPasswordResetAction(
      email,
      `${base}/reset-password`,
    );

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <AuthTitle>Check your email</AuthTitle>
        <AuthCard>
          <p className="text-sm leading-6 text-zinc-400">
            If that email address matches an account, a password reset link is
            on its way. The link expires in 1 hour.
          </p>
          {emailConfigured ? null : (
            <p className="mt-3 text-sm leading-6 text-amber-200/80">
              This instance has no email delivery configured, so the link was
              printed to the server logs instead.
            </p>
          )}
        </AuthCard>
        <AuthAltCard>
          <Link href={`${base}/signin`} className={linkClass}>
            Back to sign in
          </Link>
        </AuthAltCard>
      </>
    );
  }

  return (
    <>
      <AuthTitle>Reset your password</AuthTitle>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {emailConfigured ? null : (
        <Notice tone="info">
          Email delivery is not configured on this instance. The reset link will
          be printed to the server logs.
        </Notice>
      )}

      <AuthCard>
        <p className="mb-4 text-sm leading-6 text-zinc-400">
          Enter your account&apos;s email address and we will send you a
          password reset link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="Enter your email address"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Sending..." : "Send password reset email"}
          </button>
        </form>
      </AuthCard>

      <AuthAltCard>
        <Link href={`${base}/signin`} className={linkClass}>
          Back to sign in
        </Link>
      </AuthAltCard>
    </>
  );
}
