"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { OtpInput } from "@/components/auth/otp-input";

export function TwoFactorSetup({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);

  return (
    <Card className="flex items-center justify-between gap-4 px-4 py-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          Authenticator app (TOTP)
          {enabled ? <Badge variant="brand">On</Badge> : <Badge variant="outline">Off</Badge>}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Use an app like 1Password or Google Authenticator for a second sign-in step.
        </p>
      </div>
      {enabled ? (
        <DisableButton onDone={() => setEnabled(false)} />
      ) : (
        <EnableButton onDone={() => setEnabled(true)} />
      )}
    </Card>
  );
}

function EnableButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"password" | "verify">("password");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("password");
    setPassword("");
    setSetup(null);
    setError(null);
    setBusy(false);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || data.method !== "totp") {
      setError(err?.message ?? "Couldn't start setup. Check your password.");
      return;
    }
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    setStep("verify");
  }

  async function confirm(code: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) {
      setError(err.message ?? "That code didn't work. Try again.");
      return;
    }
    setOpen(false);
    onDone();
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Enable
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="p-6">
          {step === "password" ? (
            <form onSubmit={start}>
              <DialogTitle>Enable two-factor authentication</DialogTitle>
              <DialogDescription className="mt-1.5">
                Confirm your password to begin setup.
              </DialogDescription>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="tfa-pass">Password</Label>
                <Input
                  id="tfa-pass"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive" className="mt-4">
                  {error}
                </Alert>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !password}>
                  {busy ? "Working..." : "Continue"}
                </Button>
              </div>
            </form>
          ) : (
            setup && (
              <div>
                <DialogTitle>Scan and verify</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Scan the QR code (or enter the key) in your authenticator app, then enter the
                  6-digit code it shows.
                </DialogDescription>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <Qr uri={setup.totpURI} />
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all text-foreground">
                    {secretFrom(setup.totpURI)}
                  </code>
                </div>
                <BackupCodes codes={setup.backupCodes} />
                <div className="mt-4">
                  <Label>Enter the 6-digit code</Label>
                  <div className="mt-2 flex justify-center">
                    <OtpInput onComplete={confirm} disabled={busy} />
                  </div>
                </div>
                {error && (
                  <Alert variant="destructive" className="mt-4">
                    {error}
                  </Alert>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DisableButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Couldn't disable. Check your password.");
      return;
    }
    setOpen(false);
    setPassword("");
    onDone();
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setError(null);
          setPassword("");
          setOpen(true);
        }}
      >
        Disable
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          <form onSubmit={disable}>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription className="mt-1.5">
              Confirm your password to turn 2FA off.
            </DialogDescription>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="tfa-disable-pass">Password</Label>
              <Input
                id="tfa-disable-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive" className="mt-4">
                {error}
              </Alert>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || !password}>
                {busy ? "Working..." : "Disable 2FA"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Qr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(uri, { margin: 1, width: 180 })
      .then((d) => {
        if (active) setSrc(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [uri]);

  if (!src) return <div className="size-45 rounded-md border border-hairline bg-muted" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Two-factor QR code"
      width={180}
      height={180}
      className="rounded-md border border-hairline bg-white p-1"
    />
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the codes are still selectable below */
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-panel/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Save your backup codes</p>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-xs font-medium text-link outline-none hover:underline focus-visible:underline"
        >
          {copied ? (
            <>
              <Check className="size-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy
            </>
          )}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Use one if you lose your device. Each code works once.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-foreground select-all">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
    </div>
  );
}

function secretFrom(uri: string): string {
  const m = uri.match(/[?&]secret=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}
