"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { OtpInput } from "@/components/auth/otp-input";
import { AuthCard } from "@/components/auth/auth-card";

export default function TwoFactorPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [backup, setBackup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyTotp(code: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) {
      setError(err.message ?? "That code didn't work. Try again.");
      return;
    }
    router.push("/");
  }

  async function verifyBackup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyBackupCode({ code: backup.trim() });
    setBusy(false);
    if (err) {
      setError(err.message ?? "That backup code didn't work.");
      return;
    }
    router.push("/");
  }

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle={
        mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of your saved backup codes."
      }
    >
      {mode === "totp" ? (
        <div className="text-center">
          <OtpInput onComplete={verifyTotp} disabled={busy} />
          {error && (
            <Alert variant="destructive" className="mt-4 text-left">
              {error}
            </Alert>
          )}
          <Button
            variant="link"
            onClick={() => {
              setMode("backup");
              setError(null);
            }}
            className="mt-6 h-auto p-0 text-sm font-medium"
          >
            Use a backup code
          </Button>
        </div>
      ) : (
        <form onSubmit={verifyBackup} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-code">Backup code</Label>
            <Input
              id="backup-code"
              value={backup}
              onChange={(e) => setBackup(e.target.value)}
              autoComplete="one-time-code"
              required
            />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" disabled={busy || !backup.trim()}>
            {busy ? "Verifying..." : "Verify"}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setMode("totp");
              setError(null);
            }}
            className="h-auto p-0 text-sm font-medium"
          >
            Use your authenticator app instead
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
