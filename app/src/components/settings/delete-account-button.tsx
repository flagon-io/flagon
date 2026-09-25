"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";

export function DeleteAccountButton({ confirmWord }: { confirmWord: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = value.trim() === confirmWord;

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError(await errorMessage(res, "Couldn't delete your account."));
      return;
    }
    // Sessions are revoked server-side; force a full reload to drop all client
    // auth state, not a soft client navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setError(null);
          setValue("");
          setOpen(true);
        }}
      >
        Delete account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription className="mt-1.5">
            Your account will be deactivated and you&apos;ll be signed out immediately. This is
            reversible - support can restore it if this was a mistake.
          </DialogDescription>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono text-foreground">{confirmWord}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              {error}
            </Alert>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={del} disabled={!ready || busy}>
              {busy ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
