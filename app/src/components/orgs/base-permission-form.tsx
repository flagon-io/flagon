"use client";

import { useState } from "react";
import { Alert, Card, SelectField } from "@flagon-io/ui";
import type { BasePermission } from "@/lib/api/types";
import { errorMessage } from "@/lib/client-fetch";

// The base permission the org grants every member across all projects. We offer
// four base-permission levels - Triage and Maintain exist as per-project
// grants but aren't sensible org-wide defaults. We show the level names only; what
// each level actually grants isn't scoped yet, so we don't spell it out here.
const BASE_OPTIONS: { value: BasePermission; label: string }[] = [
  { value: "none", label: "No access" },
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "admin", label: "Admin" },
];

/**
 * Org base permission (GitHub's "Base permissions" under Member privileges). Every
 * member gets this on every project; an explicit per-project grant can raise a
 * member above it, never below it.
 */
export function BasePermissionForm({
  slug,
  basePermission,
}: {
  slug: string;
  basePermission: BasePermission;
}) {
  const [base, setBase] = useState<BasePermission>(basePermission);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    if (busy) return;
    const value = next as BasePermission;
    const prev = base;
    setBusy(true);
    setError(null);
    setBase(value);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/security`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_permission: value }),
    });
    setBusy(false);
    if (!res.ok) {
      setBase(prev);
      setError(await errorMessage(res, "Couldn't save the base permission."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-medium text-foreground">Base permission</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The default access every member gets to this organization&rsquo;s projects. Members can
          have access from multiple sources, so anyone granted a higher level on a specific project
          keeps it - the base is a floor, never a ceiling.
        </p>
        <SelectField
          className="mt-3 max-w-md"
          value={base}
          onValueChange={change}
          disabled={busy}
          options={BASE_OPTIONS}
          aria-label="Base permission"
        />
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
