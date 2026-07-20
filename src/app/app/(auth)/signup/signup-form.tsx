"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import { marketingHref } from "@/lib/urls";
import {
  isValidUsername,
  USERNAME_HINT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/lib/username";
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

const hintClass = "mt-1.5 text-xs leading-5 text-zinc-500";

export function SignUpForm() {
  const router = useRouter();
  const base = useAuthBase();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const username = String(form.get("username") ?? "").trim();

    if (password.length < 8) {
      setError("Password should be at least 8 characters.");
      return;
    }
    if (
      username.length < USERNAME_MIN_LENGTH ||
      username.length > USERNAME_MAX_LENGTH ||
      !isValidUsername(username)
    ) {
      setError(USERNAME_HINT);
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.signUp.email({
      email,
      password,
      username,
      // BetterAuth requires a display name; we don't collect one at
      // sign-up, so start with the username. Editable later in settings.
      name: username,
    });

    if (authError) {
      setPending(false);
      setError(authError.message ?? "Something went wrong. Please try again.");
      return;
    }

    // signUp auto-signs-in, straight to the console.
    router.push(base || "/");
    router.refresh();
  }

  return (
    <>
      <AuthTitle>Sign up for {brand.name}</AuthTitle>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <AuthCard>
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
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputClass}
            />
            <p className={hintClass}>Password should be at least 8 characters.</p>
          </div>

          <div>
            <label htmlFor="username" className={labelClass}>
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={USERNAME_MIN_LENGTH}
              maxLength={USERNAME_MAX_LENGTH}
              className={inputClass}
            />
            <p className={hintClass}>{USERNAME_HINT}</p>
          </div>

          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Creating account..." : "Create account"}
          </button>

          <p className="text-xs leading-5 text-zinc-500">
            By creating an account, you agree to the{" "}
            <Link href={marketingHref("/terms")} className={linkClass}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href={marketingHref("/privacy")} className={linkClass}>
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </AuthCard>

      <AuthAltCard>
        Already have an account?{" "}
        <Link href={`${base}/signin`} className={linkClass}>
          Sign in
        </Link>
        .
      </AuthAltCard>
    </>
  );
}
