"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { OtpInput } from "@/components/auth/otp-input";
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
  Skeleton,
  Switch,
} from "@flagon-io/ui";
import { SettingsHeader } from "@/components/settings/section";

interface UserEmail {
  id: string;
  email: string;
  verified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

export default function EmailSettingsPage() {
  const [emails, setEmails] = useState<UserEmail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add-email modal state.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "verify">("email");
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/emails");
    if (res.ok) {
      const data = await res.json().catch(() => ({ emails: [] }));
      setEmails(data.emails ?? []);
    } else {
      setError("Couldn't load your email addresses. Try refreshing the page.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  function openAdd() {
    setNewEmail("");
    setPendingEmail("");
    setStep("email");
    setDialogError(null);
    setOpen(true);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setDialogError(null);
    setBusy(true);
    const res = await fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDialogError(data.error ?? "Something went wrong.");
      return;
    }
    setPendingEmail(newEmail);
    setStep("verify");
  }

  async function handleVerify(otp: string) {
    if (!pendingEmail) return;
    setDialogError(null);
    const res = await fetch("/api/emails/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingEmail, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDialogError(data.error ?? "That code didn't work.");
      return;
    }
    setOpen(false);
    refresh();
  }

  async function handleResendVerify(email: string) {
    setError(null);
    const res = await fetch("/api/emails/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't resend the code.");
      return;
    }
    setPendingEmail(email);
    setStep("verify");
    setDialogError(null);
    setOpen(true);
  }

  async function handleSetPrimary(id: string) {
    setError(null);
    const res = await fetch(`/api/emails/${id}/primary`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't set that email as primary.");
      return;
    }
    refresh();
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/emails/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't remove that email.");
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Emails"
        description="Add and verify emails; your primary email is used for sign-in and notifications."
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            Add email address
          </Button>
        }
      />

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <Card className="divide-y divide-hairline">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : emails.length === 0 ? (
        error ? null : (
          <Card className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">No email addresses yet.</p>
          </Card>
        )
      ) : (
        <div className="space-y-2.5">
          <Card>
            <ul className="divide-y divide-hairline">
              {emails.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{e.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {e.isPrimary ? "Primary" : e.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!e.verified && (
                      <button
                        type="button"
                        onClick={() => handleResendVerify(e.email)}
                        aria-label={`Verify ${e.email}`}
                        className="rounded-md px-2 py-1 text-xs font-medium text-link outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Verify
                      </button>
                    )}
                    {!e.isPrimary && e.verified && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(e.id)}
                        aria-label={`Make ${e.email} the primary email`}
                        className="rounded-md px-2 py-1 text-xs font-medium text-link outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Make primary
                      </button>
                    )}
                    {!e.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleDelete(e.id)}
                        aria-label={`Remove ${e.email}`}
                        className="rounded-md px-2 py-1 text-xs font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-xs text-muted-foreground">
            {emails.length} {emails.length === 1 ? "email address" : "email addresses"}
          </p>
        </div>
      )}

      <section className="space-y-3 border-t border-hairline pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Keep my email addresses private</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Hide your emails from your public profile and use a no-reply address for Git
              operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Coming soon</Badge>
            <Switch disabled aria-label="Keep my email addresses private" />
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          {step === "email" ? (
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <DialogTitle>Add email address</DialogTitle>
                <DialogDescription className="mt-1.5">
                  We&rsquo;ll send a code to confirm you own it.
                </DialogDescription>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email address</Label>
                <Input
                  id="new-email"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !newEmail.trim()}>
                  {busy ? "Sending..." : "Send code"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="text-left">
                <DialogTitle>Verify your email</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Enter the code we sent to{" "}
                  <span className="font-semibold text-foreground">{pendingEmail}</span>.
                </DialogDescription>
              </div>
              <div className="flex justify-center">
                <OtpInput onComplete={handleVerify} />
              </div>
              {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
              <div>
                <button
                  type="button"
                  onClick={() => handleResendVerify(pendingEmail)}
                  className="text-xs font-medium text-link underline underline-offset-2"
                >
                  Resend code
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
