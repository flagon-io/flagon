"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Field, submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { toast } from "@flagon/design";
import { SocialButtons } from "@/components/social-buttons";
import type { OAuthProviders } from "@/lib/oauth";
import { authClient } from "@/lib/auth-client";

/**
 * The sign-in form, modeled on GitHub: one identifier (email OR username) plus
 * a password, with "Forgot password?" on the password label. The identifier is
 * routed to the right BetterAuth method by looking for an "@": addresses go
 * through email sign-in (any verified alias is resolved to the primary by the
 * API's sign-in hook), everything else through username sign-in. Auth is hosted
 * by the API, so these calls go to it via authClient.
 */
export function LoginForm({ providers }: { providers: OAuthProviders }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notice =
    params.get("reset") === "1"
      ? "Your password has been reset. Sign in with your new password."
      : params.get("verified") === "1"
        ? "Your email is verified. You are all set."
        : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const { error } = identifier.includes("@")
        ? await authClient.signIn.email({ email: identifier, password })
        : await authClient.signIn.username({ username: identifier, password });

      if (error) {
        const msg =
          error.message ??
          "We could not sign you in. Check your details and try again.";
        setError(msg);
        toast.error("Couldn't sign in", msg);
        setPending(false);
        return;
      }

      // Where to land is decided by the root router once the session cookie is
      // set (active org, org picker, or create-org). `redirect` carries a
      // deep-link a guard bounced us from.
      const next = params.get("redirect") || "/";
      router.push(next);
      router.refresh();
    } catch {
      // Network failure / timeout / anything that rejects: never leave the button
      // spinning. Surface it and re-enable so the user can retry.
      const msg = "We couldn't reach the server. Check your connection and try again.";
      setError(msg);
      toast.error("Sign-in failed", msg);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SocialButtons providers={providers} />

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

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

      {notice ? <FormNotice>{notice}</FormNotice> : null}
      {error ? <FormError>{error}</FormError> : null}

      <button type="submit" className={submitButtonClass} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      </form>
    </div>
  );
}
