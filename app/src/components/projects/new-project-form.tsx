"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function NewProjectForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim(),
        repository_url: repositoryUrl.trim(),
      }),
    });
    if (!res.ok) {
      setCreating(false);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't create the project.");
      return;
    }
    const project = await res.json();
    router.push(`/${orgSlug}/projects/${project.slug}`);
  }

  const canSubmit = name.trim() && effectiveSlug && !creating;

  return (
    <form onSubmit={create} className="max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="p-name">Project name</Label>
        <Input
          id="p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Checkout Service"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-slug">Slug</Label>
        <Input
          id="p-slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="checkout-service"
        />
        <p className="text-xs text-muted-foreground">
          Used in URLs: <span className="font-mono">/{orgSlug}/projects/{effectiveSlug || "..."}</span>
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
          The source repository. Linking a provider to sync automatically comes later.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        You can add a README from the project&rsquo;s Overview tab once it&rsquo;s created.
      </p>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {creating ? "Creating..." : "Create project"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/${orgSlug}/projects`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
