"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PROJECT_SLUG_HINT,
  normalizeProjectSlug,
  suggestProjectSlug,
  validateProjectSlug,
} from "@/lib/projects";
import {
  Notice,
  buttonClass,
  hintClass,
  subtleButtonClass,
} from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { createProjectAction } from "./actions";

/**
 * Project creation form; lands on the new project's page on success. The
 * slug auto-suggests from the name until the user edits it directly.
 */
export function NewProjectForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(suggestProjectSlug(value));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Give your project a name first.");
      return;
    }
    const validation = validateProjectSlug(slug);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setPending(true);
    const result = await createProjectAction(orgSlug, { name, slug });
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }

    router.push(appPath(`/${orgSlug}/projects/${normalizeProjectSlug(slug)}`));
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 border border-white/10 bg-white/2 p-6"
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div>
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Storefront"
          autoFocus
          required
        />
      </div>
      <div>
        <Label htmlFor="project-slug">Slug</Label>
        <Input
          id="project-slug"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value.toLowerCase());
          }}
          placeholder="storefront"
          required
        />
        <p className={hintClass}>
          Identifies the project in URLs, SDK configuration, and the API.{" "}
          {PROJECT_SLUG_HINT}
        </p>
      </div>
      <div className="flex items-center gap-3 border-t border-white/5 pt-5">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating..." : "Create project"}
        </button>
        <Link href={appPath(`/${orgSlug}/projects`)} className={subtleButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
