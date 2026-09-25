"use client";

// The interactive part of /settings/emails: the address table plus the add /
// verify dialog. The server page renders the initial list; after every mutation
// this re-fetches /api/emails, and a failed re-fetch shows a real error with a
// retry (never an empty list).
import { useState } from "react";
import { Plus } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { UserEmail } from "@/lib/user-emails";
import { errorMessage, fetchJson, messageOf } from "@/lib/client-fetch";
import { OtpInput } from "@/components/auth/otp-input";
import { SettingsHeader } from "@/components/settings/section";
import { ListError, TableShell } from "@/components/shared/list-states";

/** POST/DELETE to an emails route; resolves to the user-facing error, or null on success. */
async function mutate(url: string, init: RequestInit, fallback: string): Promise<string | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? null : await errorMessage(res, fallback);
  } catch {
    return "Can't reach Flagon right now. Check your connection and try again.";
  }
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function EmailsManager({ initialEmails }: { initialEmails: UserEmail[] }) {
  const [emails, setEmails] = useState<UserEmail[]>(initialEmails);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-email modal state.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "verify">("email");
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await fetchJson<{ emails: UserEmail[] }>(
        "/api/emails",
        undefined,
        "Couldn't load your email addresses. Try refreshing the page.",
      );
      setEmails(data.emails);
      setLoadError(null);
    } catch (e) {
      setLoadError(messageOf(e, "Couldn't load your email addresses. Try refreshing the page."));
    }
  }

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
    const err = await mutate("/api/emails", jsonPost({ email: newEmail }), "Something went wrong.");
    setBusy(false);
    if (err) {
      setDialogError(err);
      return;
    }
    setPendingEmail(newEmail);
    setStep("verify");
  }

  async function handleVerify(otp: string) {
    if (!pendingEmail) return;
    setDialogError(null);
    const err = await mutate(
      "/api/emails/verify",
      jsonPost({ email: pendingEmail, otp }),
      "That code didn't work.",
    );
    if (err) {
      setDialogError(err);
      return;
    }
    setOpen(false);
    await refresh();
  }

  async function handleResendVerify(email: string) {
    setError(null);
    const err = await mutate("/api/emails/resend", jsonPost({ email }), "Couldn't resend the code.");
    if (err) {
      setError(err);
      return;
    }
    setPendingEmail(email);
    setStep("verify");
    setDialogError(null);
    setOpen(true);
  }

  async function handleSetPrimary(id: string) {
    setError(null);
    const err = await mutate(
      `/api/emails/${id}/primary`,
      { method: "POST" },
      "Couldn't set that email as primary.",
    );
    if (err) {
      setError(err);
      return;
    }
    await refresh();
  }

  async function handleDelete(id: string) {
    setError(null);
    const err = await mutate(`/api/emails/${id}`, { method: "DELETE" }, "Couldn't remove that email.");
    if (err) {
      setError(err);
      return;
    }
    await refresh();
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

      {loadError ? (
        <ListError
          title="Couldn't load your email addresses"
          message={loadError}
          onRetry={refresh}
        />
      ) : emails.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No email addresses yet.</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="px-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="px-4 font-medium">
                      <span className="break-all">{e.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.isPrimary ? "brand" : e.verified ? "success" : "outline"}>
                        {e.isPrimary ? "Primary" : e.verified ? "Verified" : "Unverified"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex justify-end gap-3">
                        {!e.verified && (
                          <Button
                            variant="link"
                            onClick={() => handleResendVerify(e.email)}
                            aria-label={`Verify ${e.email}`}
                            className="h-auto p-0 text-xs font-medium"
                          >
                            Verify
                          </Button>
                        )}
                        {!e.isPrimary && e.verified && (
                          <Button
                            variant="link"
                            onClick={() => handleSetPrimary(e.id)}
                            aria-label={`Make ${e.email} the primary email`}
                            className="h-auto p-0 text-xs font-medium"
                          >
                            Make primary
                          </Button>
                        )}
                        {!e.isPrimary && (
                          <Button
                            variant="link"
                            onClick={() => handleDelete(e.id)}
                            aria-label={`Remove ${e.email}`}
                            className="h-auto p-0 text-xs font-medium text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
          <p className="text-xs text-muted-foreground">
            {emails.length} {emails.length === 1 ? "email address" : "email addresses"}
          </p>
        </div>
      )}

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
                <Button
                  variant="link"
                  onClick={() => handleResendVerify(pendingEmail)}
                  className="h-auto p-0 text-xs font-medium"
                >
                  Resend code
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
