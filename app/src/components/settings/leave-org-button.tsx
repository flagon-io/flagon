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
import { errorMessage } from "@/lib/client-fetch";

export function LeaveOrgButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/leave`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't leave the organization."));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-destructive hover:text-destructive"
      >
        Leave
      </Button>

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
