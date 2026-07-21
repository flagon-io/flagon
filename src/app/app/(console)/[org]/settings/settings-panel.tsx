"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { brand } from "@/lib/brand";
import { ORG_SLUG_HINT } from "@/lib/org-slug";
import {
  Notice,
  buttonClass,
  dangerButtonClass,
  hintClass,
} from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { appPath } from "@/lib/urls";
import {
  changeOrganizationSlugAction,
  deleteOrganizationAction,
  renameOrganizationAction,
} from "./actions";

/**
 * General settings: display name (admins), URL and deletion (owner only).
 * Deleting requires typing the slug, the same confirmation shape projects
 * use.
 */
export function OrgSettingsPanel({
  orgSlug,
  currentName,
  isOwner,
}: {
  orgSlug: string;
  currentName: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [slug, setSlug] = useState(orgSlug);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState<"name" | "slug" | "delete" | null>(
    null,
  );

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setPending("name");
    const result = await renameOrganizationAction(orgSlug, name);
    setPending(null);
    if (!result.ok) return setError(result.message);
    setSaved("Organization renamed.");
    router.refresh();
  }

  async function changeSlug(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setPending("slug");
    const result = await changeOrganizationSlugAction(orgSlug, slug);
    if (!result.ok) {
      setPending(null);
      return setError(result.message);
    }
    // Every URL moved: land on the new one.
    router.replace(appPath(`/${result.slug}/settings`));
    router.refresh();
  }

  async function destroy(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("delete");
    const result = await deleteOrganizationAction(orgSlug);
    if (!result.ok) {
      setPending(null);
      return setError(result.message);
    }
    router.replace(appPath("/"));
    router.refresh();
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}

      <form
        onSubmit={rename}
        className="space-y-4 border border-white/10 bg-white/2 p-5"
      >
        <div>
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className={hintClass}>The display name, shown across the app.</p>
        </div>
        <button
          type="submit"
          disabled={pending !== null || name.trim() === currentName}
          className={buttonClass}
        >
          {pending === "name" ? "Saving..." : "Rename organization"}
        </button>
      </form>

      {isOwner ? (
        <form
          onSubmit={changeSlug}
          className="mt-6 space-y-4 border border-white/10 bg-white/2 p-5"
        >
          <div>
            <Label htmlFor="org-slug">Organization URL</Label>
            <Input
              id="org-slug"
              prepend={`app.${brand.domain}/`}
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              required
            />
            <p className={hintClass}>
              Changing this moves every URL and API path for this
              organization; existing links stop working. {ORG_SLUG_HINT}
            </p>
          </div>
          <button
            type="submit"
            disabled={pending !== null || slug === orgSlug}
            className={buttonClass}
          >
            {pending === "slug" ? "Changing..." : "Change URL"}
          </button>
        </form>
      ) : null}

      {isOwner ? (
        <div className="mt-10 border border-red-500/20 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">Danger zone</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Deleting the organization permanently removes its projects,
            teams, and access grants. This cannot be undone.
          </p>
          <form onSubmit={destroy} className="mt-4 space-y-3">
            <div className="max-w-sm">
              <Label htmlFor="confirm-slug">
                Type <span className="font-mono text-zinc-300">{orgSlug}</span>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-slug"
                value={confirmSlug}
                onChange={(event) => setConfirmSlug(event.target.value)}
                placeholder={orgSlug}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={pending !== null || confirmSlug !== orgSlug}
              className={`${dangerButtonClass} inline-flex items-center gap-1.5`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {pending === "delete"
                ? "Deleting..."
                : "Delete this organization"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
