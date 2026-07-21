"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brand } from "@/lib/brand";
import { signInAction } from "../actions";
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

export function SignInForm({
  passwordWasReset,
}: {
  passwordWasReset: boolean;
}) {
  const router = useRouter();
  const base = useAuthBase();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");

    // One field: username, or ANY verified email the account
    // owns (the server action resolves alternates against user_emails).
    const result = await signInAction(identifier, password);

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    router.push(base || "/");
    router.refresh();
  }

  return (
    <>
      <AuthTitle>Sign in to {brand.name}</AuthTitle>

      {passwordWasReset ? (
        <Notice tone="success">
          Your password has been reset. Sign in with your new password.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className={labelClass}>
              Username or email address
            </label>
            <input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoFocus
              required
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <Link
                href={`${base}/forgot-password`}
                className={`text-xs ${linkClass}`}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </AuthCard>

      <AuthAltCard>
        New to {brand.name}?{" "}
        <Link href={`${base}/signup`} className={linkClass}>
          Create an account
        </Link>
        .
      </AuthAltCard>
    </>
  );
}
