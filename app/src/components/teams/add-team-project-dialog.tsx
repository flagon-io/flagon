"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Label,
} from "@flagon-io/ui";
import type { Page, Project, ProjectRole } from "@/lib/api/types";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { PROJECT_ROLE_OPTIONS, RoleSelect } from "./team-shared";

export function AddTeamProjectDialog({
  open,
  onOpenChange,
  slug,
  teamSlug,
  granted,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  teamSlug: string;
  granted: string[];
  onAdded: () => Promise<void>;
}) {
  const [project, setProject] = useState("");
  const [role, setRole] = useState<ProjectRole>("write");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-side search over the org's projects, excluding ones the team already
  // has, so the picker works no matter how many projects the org has. A failed
  // search throws, which the picker shows as a failure rather than "no matches".
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const loadProjects = useCallback(
    async (query: string) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const data = await fetchJson<Page<Pick<Project, "id" | "name" | "slug">>>(
        `/api/orgs/${encodeURIComponent(slug)}/projects?${params.toString()}`,
        undefined,
        "Couldn't search projects.",
      );
      return (data.items ?? [])
        .filter((p) => !grantedSet.has(p.slug))
        .map((p) => ({ value: p.slug, label: p.name }));
    },
    [slug, grantedSet],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setAdding(true);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: teamSlug, role }),
      },
    );
    setAdding(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't grant access to that project."));
      return;
    }
    onOpenChange(false);
    await onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription className="mt-1.5">
              Grant this team a role on a project. You need admin access on the project you pick.
            </DialogDescription>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-project">Project</Label>
            <Combobox
              id="tp-project"
              value={project}
              onValueChange={setProject}
              loadOptions={loadProjects}
              placeholder="Select a project"
              searchPlaceholder="Search projects…"
              emptyText="No matching projects."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-role">Role</Label>
            <RoleSelect
              id="tp-role"
              roles={PROJECT_ROLE_OPTIONS}
              value={role}
              onChange={(r) => setRole(r as ProjectRole)}
            />
            <p className="text-xs text-muted-foreground">
              {PROJECT_ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding || !project}>
              {adding ? "Adding..." : "Add project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
