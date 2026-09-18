"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { SocialButtons, SOCIAL_ENABLED } from "@/components/auth/social-buttons";
import { AuthCard } from "@/components/auth/auth-card";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameValid = username === "" || USERNAME_RE.test(username);
  const passwordsMatch = confirm === "" || password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!USERNAME_RE.test(username)) {
      setError("Username must be 3-30 characters: letters, numbers, hyphens, or underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await authClient.signUp.email({
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message ?? "Something went wrong. Please try again.");
      return;
    }

    router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start managing your organization with Flagon."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-link underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            type="text"
            autoComplete="username"
            required
            aria-invalid={!usernameValid || undefined}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className={`text-xs ${usernameValid ? "text-muted-foreground" : "text-destructive"}`}>
            Letters, numbers, hyphens, or underscores. 3-30 characters.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={!passwordsMatch || undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {!passwordsMatch && <p className="text-xs text-destructive">Passwords don&rsquo;t match.</p>}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? "Creating account..." : "Sign up"}
        </Button>
      </form>

      {SOCIAL_ENABLED && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-hairline" />
            or
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <SocialButtons />
        </>
      )}
    </AuthCard>
  );
}
