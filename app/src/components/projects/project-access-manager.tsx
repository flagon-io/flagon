"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, MoreHorizontal, Plus, Trash2, UserPlus } from "lucide-react";
import {
  Alert,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@flagon-io/ui";

type ProjectMember = {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

// Repository-style roles, highest privilege first for display, with a one-line
// description each. Mirrors the API's ladder (read < triage < write < maintain <
// admin) and the effective = max(org, grant) rule.
const ROLES: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control, including deleting the project and managing access." },
  { value: "maintain", label: "Maintain", hint: "Write, plus manage project settings." },
  { value: "write", label: "Write", hint: "Edit the project's name, README, and settings metadata." },
  { value: "triage", label: "Triage", hint: "Read, plus manage the project's work items." },
  { value: "read", label: "Read", hint: "View the project and its collaborators." },
];
const ROLE_RANK: Record<string, number> = { read: 1, triage: 2, write: 3, maintain: 4, admin: 5 };

export function ProjectAccessManager({
  slug,
  project,
  currentUserId,
  orgRole,
}: {
  slug: string;
  project: string;
  currentUserId: string;
  orgRole: string;
}) {
  const orgAdmin = orgRole === "owner" || orgRole === "admin";

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [login, setLogin] = useState("");
  const [newRole, setNewRole] = useState("write");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(base);
    if (res.ok) {
      const d = await res.json();
      setMembers(d.members ?? []);
    }
    setLoading(false);
  }, [base]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // You can manage collaborators if you're an org owner/admin (admin on every
  // project) or you hold an explicit admin grant on this one - the same rule the
  // API enforces.
  const myGrant = members.find((m) => m.user_id === currentUserId)?.role;
  const canManage = orgAdmin || myGrant === "admin";

  const rows = useMemo(
    () => [...members].sort((a, b) => (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0)),
    [members],
  );

  function openAdd() {
    setLogin("");
    setNewRole("write");
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = login.trim();
    if (!value) return;
    setAdding(true);
    setAddError(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: value, role: newRole }),
    });
    setAdding(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddError(d.error ?? "Couldn't add that collaborator.");
      return;
    }
    setAddOpen(false);
    await load();
  }

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(`${base}/${encodeURIComponent(userId)}/role`, {
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

  async function remove(userId: string) {
    setError(null);
    const res = await fetch(`${base}/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't remove that collaborator.");
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Give an organization member more (or less) reach on this project than their org role
          grants. A collaborator&rsquo;s effective role is the higher of their org role and their grant
          here, so a grant only ever raises access.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Alert className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Organization <strong className="font-medium text-foreground">owners and admins</strong>{" "}
          are admins on every project, and{" "}
          <strong className="font-medium text-foreground">members</strong> have write access by
          default. Those people won&rsquo;t appear below unless you grant them a different role here.
        </span>
      </Alert>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading collaborators..."
            : `${members.length} explicit ${members.length === 1 ? "collaborator" : "collaborators"}`}
        </p>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            Add collaborator
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex h-11 items-center gap-3 border-b border-hairline bg-muted/25 px-4 text-xs font-medium text-muted-foreground">
          <span className="flex-1">Collaborator</span>
          <span className="w-40 shrink-0">Role</span>
          <span className="w-8 shrink-0" aria-hidden />
        </div>

        {loading ? (
          <div className="divide-y divide-hairline">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <UserPlus className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">No extra collaborators</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Everyone gets their organization-level access to this project. Add a collaborator to
              raise a specific member&rsquo;s role here.
            </p>
            {canManage && (
              <Button size="sm" className="mt-1" onClick={openAdd}>
                <Plus className="size-4" />
                Add collaborator
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const display = m.name || m.username || m.email;
              const editable = canManage && !isSelf;
              return (
                <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel/40">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="size-9 ring-1 ring-hairline">
                      {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                      <AvatarFallback className="text-xs font-medium">{initials(m)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {display}
                        {isSelf && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>

                  <div className="w-40 shrink-0">
                    {editable ? (
                      <RoleSelect value={m.role} onChange={(r) => changeRole(m.user_id, r)} />
                    ) : (
                      <Badge variant={m.role === "admin" ? "brand" : "outline"} className="capitalize">
                        {m.role}
                      </Badge>
                    )}
                  </div>

                  <div className="w-8 shrink-0">
                    {editable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${display}`}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.email)}>
                            Copy email address
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => remove(m.user_id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Remove collaborator
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg p-6">
          <form onSubmit={submitAdd} className="space-y-4">
            <div>
              <DialogTitle>Add collaborator</DialogTitle>
              <DialogDescription className="mt-1.5">
                Grant an existing organization member a role on this project. The person must
                already belong to the organization.
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <Label htmlFor="collab-login">Email or username</Label>
              <Input
                id="collab-login"
                autoFocus
                placeholder="person@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collab-role">Role</Label>
              <RoleSelect id="collab-role" value={newRole} onChange={setNewRole} />
              <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === newRole)?.hint}</p>
            </div>

            {addError && <Alert variant="destructive">{addError}</Alert>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !login.trim()}>
                {adding ? "Adding..." : "Add collaborator"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
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
  // The per-row selector is compact (sm); the one in the add dialog sits with
  // other md fields, so it takes the default height.
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

function initials(m: ProjectMember): string {
  const base = (m.name || m.username || m.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
