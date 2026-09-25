"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";

/** Slugify a name the same way we'd expect the API to, for the live preview. */
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slug = slugify(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      setSubmitting(false);
      setError(await errorMessage(res, "Could not create organization."));
      return;
    }

    const { org } = await res.json();
    // Land in the new org's workspace.
    router.replace(`/${org.slug}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Organization name</Label>
        <Input
          id="org-name"
          type="text"
          required
          autoFocus
          placeholder="Acme Inc"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="h-4 text-xs text-muted-foreground">
          {slug ? (
            <>
              URL: <span className="font-mono text-foreground">app.flagon.io/{slug}</span>
            </>
          ) : (
            "Lowercase letters, numbers, and dashes."
          )}
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Button type="submit" disabled={submitting || !slug} className="w-full">
        {submitting ? "Creating..." : "Create organization"}
      </Button>
    </form>
  );
}
