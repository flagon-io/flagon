"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
} from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";

/**
 * Org Settings > General danger zone (owners only). Deleting is a soft delete:
 * the org disappears for every member at once and an owner can restore it from
 * Settings > Organizations for 30 days. Confirmation requires typing the slug.
 */
export function DeleteOrgDangerZone({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirm.trim() === slug;

  async function del(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      setError(await errorMessage(res, "Couldn't delete the organization."));
      return;
    }
    // The root resolver lands on the next org (or organization creation).
    router.push("/");
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Danger zone</h2>
      <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Delete this organization</p>
          <p className="text-sm text-muted-foreground">
            It disappears for every member, its projects and access tokens stop working, and its
            slug is freed. An owner can restore it for 30 days.
          </p>
        </div>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => {
            setError(null);
            setConfirm("");
            setOpen(true);
          }}
        >
          Delete organization
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <form onSubmit={del}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Every member loses access right away, including through the API and access tokens.
                You can restore it from Settings, Organizations for 30 days; after that it is gone
                for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm-delete-org">
                Type <span className="font-mono text-foreground">{slug}</span> to confirm
              </Label>
              <Input
                id="confirm-delete-org"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {error && (
              <Alert variant="destructive" className="mt-4">
                {error}
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!ready || busy}>
                {busy ? "Deleting..." : "Delete organization"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
