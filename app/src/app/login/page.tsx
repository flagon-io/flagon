"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { SocialButtons } from "@/components/auth/social-buttons";
import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const isEmail = identifier.includes("@");
    const { error: signInError } = isEmail
      ? await authClient.signIn.email({ email: identifier, password })
      : await authClient.signIn.username({ username: identifier, password });

    setSubmitting(false);

    if (signInError) {
      if (signInError.status === 403 && isEmail) {
        router.push(`/verify-email?email=${encodeURIComponent(identifier)}`);
        return;
      }
      setError(signInError.message ?? "Invalid credentials. Please try again.");
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-hairline" />
        or
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <SocialButtons />
    </AuthCard>
  );
}
