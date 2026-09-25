"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import type { Team } from "@/lib/api/types";
import { errorMessage } from "@/lib/client-fetch";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function NewTeamForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim(),
      }),
    });
    if (!res.ok) {
      setCreating(false);
      setError(await errorMessage(res, "Couldn't create the team."));
      return;
    }
    const team = (await res.json()) as Team;
    router.push(`/${orgSlug}/teams/${team.slug}`);
  }

  const canSubmit = name.trim() && effectiveSlug && !creating;

  return (
    <form onSubmit={create} className="max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="t-name">Team name</Label>
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Platform"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-slug">Slug</Label>
        <Input
          id="t-slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="platform"
        />
        <p className="text-xs text-muted-foreground">
          Used in URLs: <span className="font-mono">/{orgSlug}/teams/{effectiveSlug || "..."}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-desc">Description</Label>
        <Input
          id="t-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line about what this team does"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        You can add members and grant the team access to projects once it&rsquo;s created.
      </p>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {creating ? "Creating..." : "Create team"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/${orgSlug}/teams`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
