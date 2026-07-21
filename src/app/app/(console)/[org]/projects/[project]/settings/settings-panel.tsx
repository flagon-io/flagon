"use client";

import { appPath } from "@/lib/urls";
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
import { normalizeProjectSlug } from "@/lib/projects";
import {
  changeProjectSlugAction,
  deleteProjectAction,
  renameProjectAction,
} from "../actions";

/**
 * Project settings: the name, the slug, and the danger zone.
 *
 * Both destructive actions are typed-confirmation gated, for different
 * reasons: deleting is irreversible, and renaming the slug is reversible but
 * silently breaks every caller in the meantime. The name, which breaks
 * nothing, is a plain field with no ceremony at all.
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
  const [slug, setSlug] = useState(projectSlug);
  const [slugConfirm, setSlugConfirm] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<"rename" | "slug" | "delete" | null>(
    null,
  );

  const slugChanged = slug !== projectSlug && slug.length > 0;

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

  async function changeSlug(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending("slug");
    const result = await changeProjectSlugAction(orgSlug, projectSlug, slug);
    if (!result.ok) {
      setPending(null);
      setError(result.message);
      return;
    }
    // The page we are on no longer exists - this route IS the old slug - so
    // this is a navigation, not a refresh.
    router.replace(appPath(`/${orgSlug}/projects/${result.slug}/settings`));
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
    router.push(appPath(`/${orgSlug}`));
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
            The display name. Changing it affects nothing outside the console.
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

      {/* The slug sits BELOW the name and above the danger zone, in that
          order deliberately: it is the identifier every integration holds, so
          it belongs where someone looking for it will find it, and behind
          enough friction that nobody changes it while looking for something
          else. */}
      <form
        onSubmit={changeSlug}
        className="mt-6 space-y-4 border border-white/10 bg-white/2 p-5"
      >
        <div>
          <Label htmlFor="project-slug">Project slug</Label>
          <Input
            id="project-slug"
            value={slug}
            onChange={(event) => {
              setSlug(normalizeProjectSlug(event.target.value));
              setSlugConfirm("");
            }}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            required
          />
          <p className={hintClass}>
            The identifier in console URLs, in{" "}
            <span className="font-mono text-zinc-400">
              /v1/orgs/{orgSlug}/projects/{projectSlug}
            </span>
            , and in whatever your SDK configuration and scripts have
            hard-coded.
          </p>
        </div>

        {slugChanged ? (
          <div className="border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-zinc-400">
            <p className="font-medium text-amber-200">
              Renaming to <span className="font-mono">{slug || "…"}</span>{" "}
              breaks anything using the old slug.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-mono text-zinc-300">{projectSlug}</span>{" "}
                stops resolving immediately. Flagon keeps no redirect, so old
                API calls and links get a 404 rather than being quietly handed
                to whichever project takes the name next.
              </li>
              <li>
                Automation, CI configuration, and dashboards that name this
                project have to be updated by you.
              </li>
              <li>
                The old slug becomes available for any project in this
                organization, including a new one.
              </li>
            </ul>
            <p className="mt-3">
              Access grants, ownership, and the overview all follow the project
              itself and are unaffected.
            </p>
          </div>
        ) : null}

        {slugChanged ? (
          <div className="max-w-sm">
            <Label htmlFor="confirm-new-slug">
              Type <span className="font-mono text-zinc-300">{slug}</span> to
              confirm
            </Label>
            <Input
              id="confirm-new-slug"
              value={slugConfirm}
              onChange={(event) => setSlugConfirm(event.target.value)}
              placeholder={slug}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending !== null || !slugChanged || slugConfirm !== slug}
          className={buttonClass}
        >
          {pending === "slug" ? "Renaming..." : "Change slug"}
        </button>
      </form>

      <div className="mt-10 border border-red-500/20 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Danger zone</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          Deleting the project permanently removes it and every access grant on
          it. This cannot be undone.
        </p>
        <form onSubmit={destroy} className="mt-4 space-y-3">
          <div className="max-w-sm">
            <Label htmlFor="confirm-slug">
              Type{" "}
              <span className="font-mono text-zinc-300">{projectSlug}</span> to
              confirm
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
