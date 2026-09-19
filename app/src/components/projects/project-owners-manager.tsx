"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Info, MoreHorizontal, Trash2, UserPlus, UsersRound } from "lucide-react";
import {
  Alert,
  Combobox,
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  DropdownMenuTrigger,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@flagon-io/ui";

type ProjectOwner = {
  owner_type: "user" | "team";
  principal_id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  team_slug: string | null;
  created_at: string;
};

type OrgTeam = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
};

export function ProjectOwnersManager({
  slug,
  project,
  orgRole,
}: {
  slug: string;
  project: string;
  orgRole: string;
}) {
  const canManage = orgRole === "owner" || orgRole === "admin";

  const [owners, setOwners] = useState<ProjectOwner[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<"user" | "team">("user");
  const [login, setLogin] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/owners`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(base);
    if (res.ok) {
      const d = (await res.json()) as { items: ProjectOwner[]; next: string | null };
      setOwners(d.items ?? []);
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
        const d = (await res.json()) as { items: ProjectOwner[]; next: string | null };
        setOwners((prev) => [...prev, ...(d.items ?? [])]);
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

  // Server-side search over the org's teams, excluding teams that already own the
  // project, so the owner picker scales past a single page of teams.
  const ownedTeamSlugs = useMemo(
    () => new Set(owners.filter((o) => o.owner_type === "team").map((o) => o.team_slug)),
    [owners],
  );
  const loadTeams = useCallback(
    async (query: string) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/teams?${params.toString()}`);
      const d = res.ok ? await res.json() : { items: [] };
      return (d.items as OrgTeam[])
        .filter((t) => !ownedTeamSlugs.has(t.slug))
        .map((t) => ({ value: t.slug, label: t.name }));
    },
    [slug, ownedTeamSlugs],
  );

  function openAdd() {
    setTab("user");
    setLogin("");
    setTeamSlug("");
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = tab === "user" ? login.trim() : teamSlug;
    if (!value) return;
    setAdding(true);
    setAddError(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: tab, login: value }),
    });
    setAdding(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddError(d.error ?? "Couldn't add that owner.");
      return;
    }
    setAddOpen(false);
    await load();
  }

  async function remove(owner: ProjectOwner) {
    setError(null);
    const res = await fetch(
      `${base}/${encodeURIComponent(owner.owner_type)}/${encodeURIComponent(owner.principal_id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't remove that owner.");
    }
    await load();
  }

  const canSubmit = tab === "user" ? !!login.trim() : !!teamSlug;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Owners</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owners are the top tier of access: they can delete or transfer the project and manage its
          owners. An owner can be a person or a whole team.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Alert className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Organization <strong className="font-medium text-foreground">owners and admins</strong>{" "}
          can always manage this project, so they don&rsquo;t need to be listed here. Add an owner to
          give someone outside that group full control.
        </span>
      </Alert>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading owners..."
            : `${owners.length} explicit ${owners.length === 1 ? "owner" : "owners"}`}
        </p>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="size-4" />
            Add owner
          </Button>
        )}
      </div>

      {loading ? (
        <TableShell>
          <div className="divide-y divide-hairline">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </TableShell>
      ) : owners.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Crown className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No explicit owners</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Organization owners and admins already have full control. Add an owner to grant that
            same control to another person or a team.
          </p>
          {canManage && (
            <Button size="sm" className="mt-1" onClick={openAdd}>
              <UserPlus className="size-4" />
              Add owner
            </Button>
          )}
        </Card>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((o) => {
                const isTeam = o.owner_type === "team";
                const display = isTeam ? o.name || o.team_slug || "Team" : o.name || o.username || o.email || "User";
                const sub = isTeam ? `@${o.team_slug}` : o.email;
                return (
                  <TableRow key={`${o.owner_type}:${o.principal_id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {isTeam ? (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <UsersRound className="size-4" />
                          </span>
                        ) : (
                          <Avatar className="size-9 ring-1 ring-hairline">
                            {o.avatar_url && <AvatarImage src={o.avatar_url} alt="" />}
                            <AvatarFallback className="text-xs font-medium">{ownerInitials(display)}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className="min-w-0">
                          {isTeam && o.team_slug ? (
                            <Link
                              href={`/${slug}/teams/${encodeURIComponent(o.team_slug)}`}
                              className="truncate text-sm font-medium text-foreground hover:underline"
                            >
                              {display}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-medium text-foreground">{display}</p>
                          )}
                          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{isTeam ? "Team" : "User"}</Badge>
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${display}`}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onClick={() => remove(o)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" />
                              Remove owner
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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
              <DialogTitle>Add owner</DialogTitle>
              <DialogDescription className="mt-1.5">
                Give a person or a team full control of this project. They must already belong to the
                organization.
              </DialogDescription>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "user" | "team")}>
              <TabsList className="w-full">
                <TabsTrigger value="user" className="flex-1">
                  Person
                </TabsTrigger>
                <TabsTrigger value="team" className="flex-1">
                  Team
                </TabsTrigger>
              </TabsList>

              <TabsContent value="user" className="mt-4 space-y-2">
                <Label htmlFor="po-login">Email or username</Label>
                <Input
                  id="po-login"
                  autoFocus
                  placeholder="person@example.com"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">An existing organization member.</p>
              </TabsContent>

              <TabsContent value="team" className="mt-4 space-y-2">
                <Label htmlFor="po-team">Team</Label>
                <Combobox
                  id="po-team"
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
              </TabsContent>
            </Tabs>

            {addError && <Alert variant="destructive">{addError}</Alert>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !canSubmit}>
                {adding ? "Adding..." : "Add owner"}
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

function ownerInitials(display: string): string {
  const base = display.trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
