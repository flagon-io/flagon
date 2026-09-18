"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@flagon-io/ui";

export function LeaveOrgButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/leave`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't leave the organization.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-md px-2 py-1 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive"
      >
        Leave
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Leave {name}?</DialogTitle>
          <DialogDescription className="mt-1.5">
            You&apos;ll lose access to this organization unless you&apos;re invited again.
          </DialogDescription>
          {error && (
            <Alert variant="destructive" className="mt-4">
              {error}
            </Alert>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={leave} disabled={busy}>
              {busy ? "Leaving..." : "Leave organization"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
