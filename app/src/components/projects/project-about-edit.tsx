"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
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

// The gear on the project's About box, GitHub-style: opens a modal to edit the
// project's description and linked repository. Uses the same update-project API
// as the Settings tab.
export function ProjectAboutEdit({
  orgSlug,
  project,
}: {
  orgSlug: string;
  project: { slug: string; description: string; repository_url: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(project.description);
  const [repositoryUrl, setRepositoryUrl] = useState(project.repository_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDescription(project.description);
    setRepositoryUrl(project.repository_url);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(project.slug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        aria-label="Edit About"
        title="Edit repository details"
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Settings className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Edit project details</DialogTitle>
          <DialogDescription className="mt-1.5">
            Shown on the project&rsquo;s overview. The README is edited separately.
          </DialogDescription>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="about-description">Description</Label>
              <Input
                id="about-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="about-repo">Linked repository</Label>
              <Input
                id="about-repo"
                type="url"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/acme/checkout-service"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              {error}
            </Alert>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
