"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@flagon/design";
import { FormError } from "@/components/form-error";
import { authClient } from "@/lib/auth-client";

/**
 * Complete the sign-in by verifying a TOTP code (or a backup code). On success
 * BetterAuth issues the full session and we continue to the app (or the deep
 * link the login flow remembered).
 */
export function TwoFactorChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const res = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
        : await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (res?.error) {
        setError(res.error.message ?? "That code didn't match. Try again.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <Field
        label={useBackup ? "Backup code" : "Authentication code"}
        htmlFor="twofa-code"
      >
        <Input
          id="twofa-code"
          required
          autoFocus
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={useBackup ? "xxxxx-xxxxx" : "123456"}
        />
      </Field>
      {error ? <FormError>{error}</FormError> : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setUseBackup((v) => !v);
          setCode("");
          setError(null);
        }}
        className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {useBackup
          ? "Use your authenticator app instead"
          : "Use a backup code instead"}
      </button>
    </form>
  );
}
