"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus, Trash2, UsersRound } from "lucide-react";
import {
  Alert,
  Combobox,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";

type ProjectTeam = {
  team_id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
};

type OrgTeam = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
};

// Repository-style roles, highest privilege first, matching the collaborators
// ladder (read < triage < write < maintain < admin).
const ROLES: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control, including deleting the project and managing access." },
  { value: "maintain", label: "Maintain", hint: "Write, plus manage project settings." },
  { value: "write", label: "Write", hint: "Edit the project's name, README, and settings metadata." },
  { value: "triage", label: "Triage", hint: "Read, plus manage the project's work items." },
  { value: "read", label: "Read", hint: "View the project and its collaborators." },
];
const ROLE_RANK: Record<string, number> = { read: 1, triage: 2, write: 3, maintain: 4, admin: 5 };

export function ProjectTeamsManager({
  slug,
  project,
  orgRole,
}: {
  slug: string;
  project: string;
  orgRole: string;
}) {
  const canManage = orgRole === "owner" || orgRole === "admin";

  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [teamSlug, setTeamSlug] = useState("");
  const [newRole, setNewRole] = useState("write");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(base);
    if (res.ok) {
      const d = (await res.json()) as { items: ProjectTeam[]; next: string | null };
      setTeams(d.items ?? []);
      setNext(d.next ?? null);
    }
    setLoading(false);
  }, [base]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`${base}?cursor=${encodeURIComponent(next)}`);
      if (res.ok) {
        const d = (await res.json()) as { items: ProjectTeam[]; next: string | null };
        setTeams((prev) => [...prev, ...(d.items ?? [])]);
        setNext(d.next ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [base, next]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const rows = useMemo(
    () => [...teams].sort((a, b) => (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0)),
    [teams],
  );

  // Server-side search over the org's teams, excluding ones that already hold a
  // role here, so the picker scales past a single page of teams.
  const grantedSlugs = useMemo(() => new Set(teams.map((t) => t.slug)), [teams]);
  const loadTeams = useCallback(
    async (query: string) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/teams?${params.toString()}`);
      const d = res.ok ? await res.json() : { items: [] };
      return (d.items as OrgTeam[])
        .filter((t) => !grantedSlugs.has(t.slug))
        .map((t) => ({ value: t.slug, label: t.name }));
    },
    [slug, grantedSlugs],
  );

  function openAdd() {
    setTeamSlug("");
    setNewRole("write");
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!teamSlug) return;
    setAdding(true);
    setAddError(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team: teamSlug, role: newRole }),
    });
    setAdding(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddError(d.error ?? "Couldn't grant that team access.");
      return;
    }
    setAddOpen(false);
    await load();
  }

  async function changeRole(team: string, role: string) {
    setError(null);
    const res = await fetch(`${base}/${encodeURIComponent(team)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't change that role.");
    }
    await load();
  }

  async function remove(team: string) {
    setError(null);
    const res = await fetch(`${base}/${encodeURIComponent(team)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't revoke that team's access.");
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Teams</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant a whole team a role on this project. Every member of the team gets at least that
          access here.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading teams..."
            : `${teams.length} ${teams.length === 1 ? "team has" : "teams have"} access`}
        </p>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            Add team
          </Button>
        )}
      </div>

      {loading ? (
        <TableShell>
          <div className="divide-y divide-hairline">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            ))}
          </div>
        </TableShell>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <UsersRound className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No teams have access</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Grant a team a role to give all of its members access to this project at once.
          </p>
          {canManage && (
            <Button size="sm" className="mt-1" onClick={openAdd}>
              <Plus className="size-4" />
              Add team
            </Button>
          )}
        </Card>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead className="w-40">Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.team_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <UsersRound className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/${slug}/teams/${encodeURIComponent(t.slug)}`}
                          className="truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {t.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">@{t.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <RoleSelect value={t.role} onChange={(r) => changeRole(t.slug, r)} />
                    ) : (
                      <Badge variant={t.role === "admin" ? "brand" : "outline"} className="capitalize">
                        {t.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${t.name}`}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem asChild>
                            <Link href={`/${slug}/teams/${encodeURIComponent(t.slug)}`}>
                              Manage team
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => remove(t.slug)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Revoke access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}

      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg p-6">
          <form onSubmit={submitAdd} className="space-y-4">
            <div>
              <DialogTitle>Add team</DialogTitle>
              <DialogDescription className="mt-1.5">
                Give one of the organization&rsquo;s teams a role on this project.
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-team">Team</Label>
              <Combobox
                id="pt-team"
                value={teamSlug}
                onValueChange={setTeamSlug}
                loadOptions={loadTeams}
                placeholder="Select a team"
                searchPlaceholder="Search teams…"
                emptyText="No matching teams."
              />
              <p className="text-xs text-muted-foreground">
                Need a new team?{" "}
                <Link href={`/${slug}/teams/new`} className="font-medium underline">
                  Create one
                </Link>
                .
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-role">Role</Label>
              <RoleSelect id="pt-role" value={newRole} onChange={setNewRole} />
              <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === newRole)?.hint}</p>
            </div>

            {addError && <Alert variant="destructive">{addError}</Alert>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !teamSlug}>
                {adding ? "Adding..." : "Add team"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-hairline">{children}</div>;
}

function RoleSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size={id ? "md" : "sm"} className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
