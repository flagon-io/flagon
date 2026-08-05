"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button, Field, Input, toast } from "@flagon/design";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { FormError } from "@/components/form-error";
import { SettingsFooter } from "@/components/settings/section";
import { CopyField } from "@/components/settings/copy-field";

/** A grid of one-time backup codes with a reassuring note. */
function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
      <p className="text-xs font-medium text-amber-200">
        Save these backup codes somewhere safe. Each works once if you lose your
        authenticator.
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-zinc-200">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Personal TOTP two-factor enrollment. Enabling asks for the account password
 * (BetterAuth requires it), returns an otpauth URI + one-time backup codes, then
 * confirms with a code from the authenticator app. This is what a member enables
 * to satisfy an organization that requires 2FA.
 */
export function TwoFactorEnrollment({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{
    uri: string;
    secret: string;
    qr: string;
    backupCodes: string[];
  } | null>(null);
  const [code, setCode] = useState("");
  // Recovery codes revealed AFTER the authenticator is verified (never before —
  // you only get them once 2FA is actually active).
  const [savedCodes, setSavedCodes] = useState<string[] | null>(null);
  // Backup codes regenerated from the enabled state (shown once).
  const [freshBackupCodes, setFreshBackupCodes] = useState<string[] | null>(null);

  function secretFromUri(uri: string): string {
    try {
      return new URL(uri).searchParams.get("secret") ?? "";
    } catch {
      return "";
    }
  }

  function begin() {
    setError(null);
    start(async () => {
      const res = await authClient.twoFactor.enable({ password });
      if (res?.error) {
        setError(res.error.message ?? "Could not start setup. Check your password.");
        return;
      }
      const uri = res?.data?.totpURI ?? "";
      // Render the otpauth URI as a scannable QR (generated in the browser).
      const qr = uri
        ? await QRCode.toDataURL(uri, { margin: 1, width: 176 }).catch(() => "")
        : "";
      setSetup({
        uri,
        secret: secretFromUri(uri),
        qr,
        backupCodes: res?.data?.backupCodes ?? [],
      });
      setPassword("");
    });
  }

  function regenerateBackupCodes() {
    setError(null);
    setFreshBackupCodes(null);
    start(async () => {
      const res = await authClient.twoFactor.generateBackupCodes({ password });
      if (res?.error) {
        setError(res.error.message ?? "Could not regenerate codes. Check your password.");
        return;
      }
      setFreshBackupCodes(res?.data?.backupCodes ?? []);
      setPassword("");
      toast.success("New backup codes generated");
    });
  }

  function confirm() {
    setError(null);
    // The codes were minted at enable() time; hold them until the authenticator
    // is proven, then reveal them on the success step.
    const codes = setup?.backupCodes ?? [];
    start(async () => {
      const res = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (res?.error) {
        setError(res.error.message ?? "That code didn't match. Try again.");
        return;
      }
      toast.success("Two-factor authentication enabled");
      setSavedCodes(codes);
      setSetup(null);
      setCode("");
      router.refresh();
    });
  }

  function disable() {
    setError(null);
    start(async () => {
      const res = await authClient.twoFactor.disable({ password });
      if (res?.error) {
        setError(res.error.message ?? "Could not disable. Check your password.");
        return;
      }
      toast.success("Two-factor authentication disabled");
      setPassword("");
      router.refresh();
    });
  }

  // Just verified: reveal the recovery codes once, now that 2FA is active.
  if (savedCodes) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-teal-300">
          <ShieldCheck className="size-4" />
          Two-factor authentication is on.
        </div>
        <BackupCodes codes={savedCodes} />
        <SettingsFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setSavedCodes(null);
              router.refresh();
            }}
          >
            Done
          </Button>
        </SettingsFooter>
      </div>
    );
  }

  // Enabled: regenerate backup codes or disable, both behind the password.
  if (enabled) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-teal-300">
          <ShieldCheck className="size-4" />
          Two-factor authentication is on.
        </div>
        {freshBackupCodes ? <BackupCodes codes={freshBackupCodes} /> : null}
        <Field label="Confirm your password" htmlFor="twofa-pw">
          <Input
            id="twofa-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <SettingsFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !password}
            onClick={regenerateBackupCodes}
          >
            Regenerate backup codes
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending || !password}
            onClick={disable}
          >
            Disable two-factor
          </Button>
        </SettingsFooter>
      </div>
    );
  }

  // Mid-setup: scan the QR (or enter the key), then confirm with a code. Recovery
  // codes are deliberately NOT shown here — they appear on the success step once
  // the authenticator is verified.
  if (setup) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Scan this with your authenticator app, then enter the 6-digit code it
          shows to finish. Can&apos;t scan? Enter the setup key by hand.
        </p>
        <div className="flex flex-wrap items-start gap-5">
          {setup.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={setup.qr}
              alt="Two-factor QR code"
              width={176}
              height={176}
              className="rounded-lg border border-white/10 bg-white p-2"
            />
          ) : null}
          <div className="min-w-56 flex-1">
            <CopyField label="Setup key (manual entry)" value={setup.secret} />
          </div>
        </div>

        <Field label="Verification code" htmlFor="twofa-confirm-code">
          <Input
            id="twofa-confirm-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <SettingsFooter>
          <button
            type="button"
            onClick={() => setSetup(null)}
            className="mr-auto text-xs font-medium text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
          <Button type="button" variant="primary" disabled={pending || !code} onClick={confirm}>
            Verify and enable
          </Button>
        </SettingsFooter>
      </div>
    );
  }

  // Idle: start with a password.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Protect your account with a time-based code from an authenticator app.
        Some organizations require it.
      </p>
      <Field label="Confirm your password to begin" htmlFor="twofa-enable-pw">
        <Input
          id="twofa-enable-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Field>
      {error ? <FormError>{error}</FormError> : null}
      <SettingsFooter>
        <Button type="button" variant="primary" disabled={pending || !password} onClick={begin}>
          Enable two-factor authentication
        </Button>
      </SettingsFooter>
    </div>
  );
}
