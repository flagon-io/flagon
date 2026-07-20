"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Notice,
  buttonClass,
  dangerButtonClass,
  hintClass,
} from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { deleteProjectAction, renameProjectAction } from "../actions";

/**
 * Project settings: rename, and the danger zone. Deleting requires typing
 * the project slug to confirm, then lands back on the project list.
 */
export function ProjectSettingsPanel({
  orgSlug,
  projectSlug,
  currentName,
}: {
  orgSlug: string;
  projectSlug: string;
  currentName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<"rename" | "delete" | null>(null);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending("rename");
    const result = await renameProjectAction(orgSlug, projectSlug, name);
    setPending(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function destroy(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("delete");
    const result = await deleteProjectAction(orgSlug, projectSlug);
    if (!result.ok) {
      setPending(null);
      setError(result.message);
      return;
    }
    router.push(`/app/${orgSlug}/projects`);
    router.refresh();
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Project renamed.</Notice> : null}

      <form
        onSubmit={rename}
        className="space-y-4 border border-white/10 bg-white/2 p-5"
      >
        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className={hintClass}>
            The display name. The slug ({projectSlug}) is the stable
            identifier in URLs, SDK configuration, and the API, and does not
            change.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending !== null || name.trim() === currentName}
          className={buttonClass}
        >
          {pending === "rename" ? "Saving..." : "Rename project"}
        </button>
      </form>

      <div className="mt-10 border border-red-500/20 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Danger zone</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          Deleting the project permanently removes it and every access grant
          on it. This cannot be undone.
        </p>
        <form onSubmit={destroy} className="mt-4 space-y-3">
          <div className="max-w-sm">
            <Label htmlFor="confirm-slug">
              Type <span className="font-mono text-zinc-300">{projectSlug}</span>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-slug"
              value={confirmSlug}
              onChange={(event) => setConfirmSlug(event.target.value)}
              placeholder={projectSlug}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={pending !== null || confirmSlug !== projectSlug}
            className={`${dangerButtonClass} inline-flex items-center gap-1.5`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {pending === "delete" ? "Deleting..." : "Delete this project"}
          </button>
        </form>
      </div>
    </div>
  );
}
