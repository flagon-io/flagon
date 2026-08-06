"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { Field, submitButtonClass } from "@/components/field";
import { FormError } from "@/components/form-error";
import { SocialButtons } from "@/components/social-buttons";
import { USERNAME_RULE, validateUsername } from "@/lib/username";
import { safeRedirect } from "@/lib/safe-redirect";
import { WEB_URL } from "@/lib/urls";
import type { OAuthProviders } from "@/lib/oauth";

/**
 * GitHub-style registration. Social sign-in on top (disabled until configured),
 * then email + password + username. There is no separate name field: like
 * GitHub, the username is your identity, and `name` starts as the username and
 * can be set later in settings. Availability is decided on submit from the
 * server (no live probe to enumerate against).
 */
export function SignupForm({ providers }: { providers: OAuthProviders }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  const uname = username.trim();
  const usernameInvalid = uname.length >= 3 && validateUsername(uname) !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const reason = validateUsername(uname);
    if (reason) {
      setError(reason);
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.signUp.email({
        // No name is collected at signup; seed it from the username (GitHub-style).
        name: uname,
        email,
        password,
        username: uname,
      });

      if (error) {
        const msg =
          error.message ?? "We could not create your account. Please try again.";
        setError(msg);
        toast.error("Couldn't create account", msg);
        setPending(false);
        return;
      }

      // Honor a validated `redirect` (e.g. an invite the user came from);
      // otherwise let the root router decide where to land.
      const next = safeRedirect(params.get("redirect"));
      router.push(next);
      router.refresh();
    } catch {
      // Network failure / timeout / anything that rejects: never leave the button
      // spinning. Surface it and re-enable so the user can retry.
      const msg =
        "We couldn't reach the server. Check your connection and try again.";
      setError(msg);
      toast.error("Sign-up failed", msg);
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
          id="email"
          label="Email"
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@company.com"
        />
        <Field
          id="password"
          label="Password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          hint="Password should be at least 8 characters."
        />
        <Field
          id="username"
          label="Username"
          type="text"
          name="username"
          required
          autoComplete="username"
          placeholder="robin"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={usernameInvalid}
          hint={
            <span className={usernameInvalid ? "text-amber-400" : undefined}>
              {USERNAME_RULE}
            </span>
          }
        />

        {error ? <FormError>{error}</FormError> : null}

        <button type="submit" className={submitButtonClass} disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>

        <p className="text-xs/5 text-zinc-500">
          By creating an account, you agree to our{" "}
          <a
            href={`${WEB_URL}/terms`}
            className="underline underline-offset-2 hover:text-zinc-300"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={`${WEB_URL}/privacy`}
            className="underline underline-offset-2 hover:text-zinc-300"
          >
            Privacy Policy
          </a>
          .
        </p>
      </form>
    </div>
  );
}
