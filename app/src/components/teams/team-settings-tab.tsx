"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@flagon-io/ui";
import type { Team } from "@/lib/api/types";
import { errorMessage } from "@/lib/client-fetch";

export function TeamSettingsTab({
  base,
  team,
  canManage,
  canDelete,
  onRenamed,
  onDeleted,
}: {
  base: string;
  team: Team;
  canManage: boolean;
  canDelete: boolean;
  onRenamed: (team: Team) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [slug, setSlug] = useState(team.slug);
  const [description, setDescription] = useState(team.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dirty = name.trim() !== team.name || slug.trim() !== team.slug || description.trim() !== team.description;

  if (!canManage) {
    return (
      <Alert>You need to be a maintainer of this team or an organization admin to change its settings.</Alert>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't save the team."));
      return;
    }
    onRenamed((await res.json()) as Team);
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ts-name">Team name</Label>
          <Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ts-slug">Slug</Label>
          <Input id="ts-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <p className="text-xs text-muted-foreground">Changing the slug changes the team&rsquo;s URL.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ts-desc">Description</Label>
          <Input
            id="ts-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line about what this team does"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div>
          <Button type="submit" disabled={saving || !dirty || !name.trim() || !slug.trim()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>

      {canDelete && (
        <Card className="border-destructive/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this team</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Removes the team and its project access. Members keep their own access.
              </p>
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete team
            </Button>
          </div>
        </Card>
      )}

      <DeleteTeamDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        base={base}
        team={team}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function DeleteTeamDialog({
  open,
  onOpenChange,
  base,
  team,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
  team: Team;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    const res = await fetch(base, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't delete the team."));
      return;
    }
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6">
        <DialogTitle>Delete {team.name}?</DialogTitle>
        <DialogDescription className="mt-1.5">
          This removes the team and its project access. Members keep their own org and project
          access. This can&rsquo;t be undone.
        </DialogDescription>
        {error && (
          <Alert variant="destructive" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
