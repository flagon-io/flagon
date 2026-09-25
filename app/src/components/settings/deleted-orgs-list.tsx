"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  InputGroup,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { DeletedOrg } from "@/lib/api/types";
import { HttpError } from "@/lib/http-error";
import { fetchJson, messageOf } from "@/lib/client-fetch";
import { TableShell } from "@/components/shared/list-states";
import { timeAgo } from "@/lib/notifications";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function daysLeft(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Personal Settings > Organizations "Recently deleted": the orgs the viewer
 * owned that were deleted in the last 30 days. Restore tries the old slug first;
 * if another org has taken it since (409), a dialog asks for a new one.
 */
export function DeletedOrgsList({ initial }: { initial: DeletedOrg[] }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<DeletedOrg[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The org waiting on a new slug (its old one was taken), if any.
  const [renaming, setRenaming] = useState<DeletedOrg | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function restore(org: DeletedOrg, slug?: string) {
    setBusy(org.id);
    setError(null);
    setDialogError(null);
    try {
      await fetchJson(
        `/api/deleted-orgs/${encodeURIComponent(org.id)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slug ? { slug } : {}),
        },
        "Could not restore the organization.",
      );
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
      setRenaming(null);
      router.refresh();
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        if (!renaming) setNewSlug(`${org.slug}-2`);
        setRenaming(org);
        if (slug) setDialogError(e.message);
      } else if (renaming) {
        setDialogError(messageOf(e, "Could not restore the organization."));
      } else {
        setError(messageOf(e, "Could not restore the organization."));
      }
    } finally {
      setBusy(null);
    }
  }

  const slugReady = slugify(newSlug) !== "";

  return (
    <section className="mt-10 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Recently deleted</h2>
        <p className="text-sm text-muted-foreground">
          Organizations you owned that were deleted. Restore one within 30 days of its deletion.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Organization</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead>Restorable for</TableHead>
              <TableHead className="px-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => {
              const left = daysLeft(o.purge_at);
              return (
                <TableRow key={o.id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{o.name}</span>
                      <Badge variant="outline" className="font-mono">
                        {o.slug}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timeAgo(o.deleted_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {left === 1 ? "1 day" : `${left} days`}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restore(o)}
                      disabled={busy === o.id}
                    >
                      <RotateCcw className="size-4" />
                      {busy === o.id ? "Restoring..." : "Restore"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>

      <Dialog open={renaming !== null} onOpenChange={(v) => !v && !busy && setRenaming(null)}>
        <DialogContent className="p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming && slugReady) restore(renaming, slugify(newSlug));
            }}
          >
            <DialogTitle>Restore {renaming?.name} under a new slug</DialogTitle>
            <DialogDescription className="mt-1.5">
              Another organization took{" "}
              <span className="font-mono text-foreground">{renaming?.slug}</span> while this one was
              deleted. Choose a new slug to restore it under; links to the old slug won&apos;t
              follow it.
            </DialogDescription>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="restore-org-slug">New slug</Label>
              <InputGroup
                id="restore-org-slug"
                prefix="app.flagon.io/"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                onBlur={() => setNewSlug((s) => slugify(s))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {dialogError && (
              <Alert variant="destructive" className="mt-4">
                {dialogError}
              </Alert>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(null)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!slugReady || busy !== null}>
                {busy ? "Restoring..." : "Restore organization"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
