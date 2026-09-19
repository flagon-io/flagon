"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert, Button } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";

/**
 * Initiates SSO for a specific org provider, used on the "SSO required" challenge
 * page. On success the user is redirected to the IdP and back to the org.
 */
export function SsoContinue({ providerId, slug }: { providerId: string; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.sso({
      providerId,
      callbackURL: `/${slug}`,
    });
    setBusy(false);
    if (err) setError(err.message ?? "Could not start single sign-on.");
  }

  return (
    <div className="w-full space-y-2">
      <Button className="w-full" onClick={go} disabled={busy}>
        <KeyRound className="size-4" />
        {busy ? "Redirecting…" : "Continue with SSO"}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
