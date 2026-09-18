"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/auth/auth-card";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const tokenError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A missing/invalid token means the link is bad or expired.
  if (!token || tokenError) {
    return (
      <AuthCard title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message ?? "Couldn't reset your password. The link may have expired.");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <>
          Back to{" "}
          <Link href="/login" className="font-medium text-link underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? "Saving..." : "Reset password"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
