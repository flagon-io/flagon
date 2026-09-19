"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert, Button, Input } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";

/**
 * "Sign in with SSO": the user enters their work email and BetterAuth routes them
 * to the SSO provider registered for that email's domain (which then provisions
 * their org membership). A first-class login option alongside password + social.
 */
export function SsoSignin() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" />
        Sign in with SSO
      </Button>
    );
  }

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.sso({ email: email.trim(), callbackURL: "/" });
    setBusy(false);
    if (err) setError(err.message ?? "No SSO provider is configured for that email domain.");
  }

  return (
    <form onSubmit={go} className="space-y-2">
      <Input
        type="email"
        required
        autoFocus
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Work email"
      />
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Redirecting…" : "Continue with SSO"}
        </Button>
      </div>
    </form>
  );
}
