"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/auth/auth-card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: reqError } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setSubmitting(false);
    if (reqError) {
      setError(reqError.message ?? "Couldn't send the reset email. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle={
        sent
          ? undefined
          : "Enter your account email and we'll send you a link to choose a new password."
      }
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-link underline">
            Log in
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert variant="success">
          If an account exists for <span className="font-medium">{email}</span>, a password reset
          link is on its way. It expires in 1 hour.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" disabled={submitting || !email.trim()} className="mt-1 w-full">
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
