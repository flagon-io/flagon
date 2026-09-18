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
  Input,
  Label,
} from "@flagon-io/ui";
import type { Project } from "@/lib/flagon-api";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function ProjectSettingsForm({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description);
  const [repositoryUrl, setRepositoryUrl] = useState(project.repository_url);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== project.name ||
    slug !== project.slug ||
    description !== project.description ||
    repositoryUrl !== project.repository_url;
  const canSave = dirty && name.trim() !== "" && slug !== "" && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(project.slug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          repository_url: repositoryUrl.trim(),
        }),
      },
    );
    if (!res.ok) {
      setSaving(false);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't save your changes.");
      return;
    }
    const updated: Project = await res.json();
    setSaving(false);
    setSaved(true);
    // A rename changes the URL; follow it to the new slug's settings page.
    if (updated.slug !== project.slug) {
      router.push(`/${orgSlug}/projects/${updated.slug}/settings`);
    }
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-10">
      <form onSubmit={save} className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Project name</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-slug">Slug</Label>
          <Input
            id="p-slug"
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSaved(false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Used in URLs: <span className="font-mono">/{orgSlug}/projects/{slug || "..."}</span>.
            Renaming changes the project&rsquo;s URL.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-desc">Description</Label>
          <Input
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line about what this project does"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-repo">Repository URL</Label>
          <Input
            id="p-repo"
            type="url"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/acme/checkout-service"
          />
          <p className="text-xs text-muted-foreground">
            The README is edited from the project&rsquo;s Overview tab.
          </p>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSave}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {saved && !dirty && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </form>

      {/* Project-level access control (collaborators + teams) is how RBAC will
          work around a project - placeholder until it ships. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Collaborators and teams</h2>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-panel/40 px-4 py-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              Manage project access
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Soon
              </span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Grant people and teams roles on this project, on top of the organization&rsquo;s
              membership. Fine-grained project RBAC is coming.
            </p>
          </div>
          <Button variant="outline" disabled>
            Add people
          </Button>
        </div>
      </section>

      <DangerZone orgSlug={orgSlug} project={project} />
    </div>
  );
}

function DangerZone({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirm.trim() === project.slug;

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(project.slug)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setBusy(false);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't delete the project.");
      return;
    }
    router.push(`/${orgSlug}/projects`);
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Danger zone</h2>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">Delete this project</p>
          <p className="text-sm text-muted-foreground">
            Soft delete: it can be restored, and its slug is freed for reuse right away.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            setError(null);
            setConfirm("");
            setOpen(true);
          }}
        >
          Delete project
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Delete {project.name}?</DialogTitle>
          <DialogDescription className="mt-1.5">
            This soft-deletes the project. You can restore it later, and the slug becomes available
            for a new project immediately.
          </DialogDescription>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono text-foreground">{project.slug}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
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
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={del} disabled={!ready || busy}>
              {busy ? "Deleting..." : "Delete project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
