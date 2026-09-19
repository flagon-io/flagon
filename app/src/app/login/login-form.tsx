"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { SocialButtons, SOCIAL_ENABLED } from "@/components/auth/social-buttons";
import { SsoSignin } from "@/components/auth/sso-signin";
import { AuthCard } from "@/components/auth/auth-card";
import type { DemoAutofill } from "@/lib/demo";

export function LoginForm({ demo }: { demo: DemoAutofill | null }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(demo?.identifier ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const isEmail = identifier.includes("@");
    const { data, error: signInError } = isEmail
      ? await authClient.signIn.email({ email: identifier, password })
      : await authClient.signIn.username({ username: identifier, password });

    setSubmitting(false);

    if (signInError) {
      // 403 = email not verified. Route to verification either way; if they
      // signed in by username we don't have the email, so the page prompts.
      if (signInError.status === 403) {
        router.push(isEmail ? `/verify-email?email=${encodeURIComponent(identifier)}` : "/verify-email");
        return;
      }
      setError(signInError.message ?? "Invalid credentials. Please try again.");
      return;
    }

    // 2FA-enrolled accounts get a second step before the session is issued.
    if (data && (data as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
      router.push("/two-factor");
      return;
    }

    router.push("/");
  }

  return (
    <AuthCard
      title="Log in to Flagon"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-link underline">
            Sign up
          </Link>
        </>
      }
    >
      {demo && (
        <Alert variant="brand" icon={<Info />} className="mb-4 text-xs">
          <span className="font-medium">Development:</span> pre-filled your seeded demo account.
          Just click <span className="font-medium">Log in</span>. (Only shown locally when a demo
          user exists.)
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-hairline" />
        or
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <div className="flex flex-col gap-2">
        {SOCIAL_ENABLED && <SocialButtons />}
        <SsoSignin />
      </div>
    </AuthCard>
  );
}
