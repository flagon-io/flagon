"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Field, submitButtonClass } from "@/components/field";
import { FormError } from "@/components/form-error";
import { SocialButtons } from "@/components/social-buttons";
import { isReserved } from "@/lib/reserved";
import { WEB_URL } from "@/lib/urls";
import type { OAuthProviders } from "@/lib/oauth";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/i;
const USERNAME_RULE =
  "Username may only contain letters, numbers, or single hyphens, and cannot begin or end with a hyphen.";

function validateUsername(value: string): string | null {
  if (value.length < 3) return "Username must be at least 3 characters.";
  if (value.length > 39) return "Username must be at most 39 characters.";
  if (!USERNAME_RE.test(value)) return USERNAME_RULE;
  if (isReserved(value)) return "That username is reserved.";
  return null;
}

/**
 * GitHub-style registration. Social sign-in on top (disabled until configured),
 * then email + password + username. There is no separate name field: like
 * GitHub, the username is your identity, and `name` starts as the username and
 * can be set later in settings. Availability is decided on submit from the
 * server (no live probe to enumerate against).
 */
export function SignupForm({ providers }: { providers: OAuthProviders }) {
  const router = useRouter();
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
    const { error } = await authClient.signUp.email({
      // No name is collected at signup; seed it from the username (GitHub-style).
      name: uname,
      email,
      password,
      username: uname,
    });

    if (error) {
      setError(
        error.message ?? "We could not create your account. Please try again.",
      );
      setPending(false);
      return;
    }

    router.push("/");
    router.refresh();
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
