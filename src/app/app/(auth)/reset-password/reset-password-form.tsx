"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
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

export function ResetPasswordForm({
  token,
  invalid,
}: {
  token: string | null;
  invalid: boolean;
}) {
  const router = useRouter();
  const base = useAuthBase();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (invalid || !token) {
    return (
      <>
        <AuthTitle>Reset your password</AuthTitle>
        <AuthCard>
          <p className="text-sm leading-6 text-zinc-400">
            This password reset link is invalid or has expired. Request a new
            one and try again.
          </p>
        </AuthCard>
        <AuthAltCard>
          <Link href={`${base}/forgot-password`} className={linkClass}>
            Request a new reset link
          </Link>
        </AuthAltCard>
      </>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < 8) {
      setError("Password should be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    });

    if (authError) {
      setPending(false);
      setError(authError.message ?? "Something went wrong. Please try again.");
      return;
    }

    router.push(`${base}/signin?reset=1`);
  }

  return (
    <>
      <AuthTitle>Choose a new password</AuthTitle>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className={labelClass}>
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="confirm" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Updating password..." : "Update password"}
          </button>
        </form>
      </AuthCard>
    </>
  );
}
