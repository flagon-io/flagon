"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Clock, Lock, LogOut, Mail, MailPlus, MoreHorizontal, Plus, Search, Trash2, UserPlus } from "lucide-react";
import {
  Alert,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  Checkbox,
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
  Kbd,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@flagon-io/ui";

type Member = {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  inviter: string | null;
  expires_at: string;
  created_at: string;
};

type InviteRow = { login: string; role: string };
type Tab = "members" | "pending";
type Sort = "joined" | "name" | "role";

const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MembersManager({
  slug,
  currentUserId,
  currentRole,
}: {
  slug: string;
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const canManage = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Invitation[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("joined");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([{ login: "", role: "member" }]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/members`);
    if (res.ok) {
      const d = await res.json();
      setMembers(d.members ?? []);
    }
    setLoading(false);
    setSelected(new Set());
  }, [slug]);

  const loadInvites = useCallback(async () => {
    setPendingLoading(true);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/invitations`);
    if (res.ok) {
      const d = await res.json();
      setPending(d.invitations ?? []);
    }
    setPendingLoading(false);
  }, [slug]);

  useEffect(() => {
    (async () => {
      await Promise.all([load(), loadInvites()]);
    })();
  }, [load, loadInvites]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      filterRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isRemovable = useCallback(
    (m: Member) => canManage && m.user_id !== currentUserId && !(m.role === "owner" && !isOwner),
    [canManage, currentUserId, isOwner],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return `${m.name ?? ""} ${m.username ?? ""} ${m.email}`.toLowerCase().includes(q);
    });
    list.sort((a, b) => {
      if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email);
      if (sort === "role") return (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0);
      return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
    });
    return list;
  }, [members, query, roleFilter, sort]);

  const selectableRows = useMemo(() => rows.filter(isRemovable), [rows, isRemovable]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((m) => selected.has(m.user_id));
  const someSelected = selected.size > 0;

  // Mirrors the backend rule (an org must always keep an owner): you can't leave
  // if you're the only owner - which also covers being the only member.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const canLeaveSelf = !(currentRole === "owner" && ownerCount <= 1);
  const leaveLockReason = members.length <= 1 ? "You're the only member." : "You're the only owner.";

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((m) => m.user_id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAdd() {
    setInvites([{ login: "", role: "member" }]);
    setAddError(null);
    setAddOpen(true);
  }
  function setInvite(i: number, patch: Partial<InviteRow>) {
    setInvites((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submitInvites(e: React.FormEvent) {
    e.preventDefault();
    const list = invites.filter((r) => r.login.trim());
    if (list.length === 0) return;
    setAdding(true);
    setAddError(null);
    const failures: string[] = [];
    for (const row of list) {
      const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: row.login.trim(), role: row.role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        failures.push(`${row.login.trim()}: ${d.error ?? "couldn't invite"}`);
      }
    }
    setAdding(false);
    await Promise.all([load(), loadInvites()]);
    if (failures.length > 0) {
      setAddError(failures.join("\n"));
      setInvites(list.filter((r) => failures.some((f) => f.startsWith(`${r.login.trim()}:`))));
      return;
    }
    setAddOpen(false);
  }

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/role`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't change that role.");
    }
    await load();
  }

  async function removeOne(userId: string) {
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Couldn't remove that member.");
    }
  }

  async function remove(userId: string) {
    setError(null);
    try {
      await removeOne(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that member.");
    }
    await load();
  }

  async function removeSelected() {
    setError(null);
    const ids = [...selected];
    let firstErr: string | null = null;
    for (const id of ids) {
      try {
        await removeOne(id);
      } catch (e) {
        if (!firstErr) firstErr = e instanceof Error ? e.message : "Couldn't remove some members.";
      }
    }
    if (firstErr) setError(firstErr);
    await load();
  }

  async function revokeInvite(id: string) {
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't revoke that invitation.");
    }
    await loadInvites();
  }

  async function leave() {
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/leave`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't leave the organization.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="space-y-5">
      {error && <Alert variant="destructive">{error}</Alert>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="gap-6">
          <TabsTrigger value="members" className="gap-1.5">
            Members
            <Badge variant="secondary">{members.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending invitations
            {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-5">
          <PendingInvites
            invites={pending}
            loading={pendingLoading}
            canManage={canManage}
            onRevoke={revokeInvite}
            onInvite={canManage ? openAdd : undefined}
          />
        </TabsContent>

        <TabsContent value="members" className="mt-5 space-y-4">
          {/* Toolbar. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={filterRef}
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter members..."
                aria-label="Filter members"
                className="pr-10 pl-9"
              />
              <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger size="sm" className="w-36">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="joined">Newest</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="role">Role</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <Button size="sm" onClick={openAdd}>
                <Plus className="size-4" />
                Invite people
              </Button>
            )}
          </div>

          {/* Table. */}
          <Card className="overflow-hidden">
            <div className="flex h-11 items-center gap-3 border-b border-hairline bg-muted/25 px-4 text-xs font-medium text-muted-foreground">
              {canManage && (
                <Checkbox
                  aria-label="Select all"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onCheckedChange={toggleAll}
                />
              )}
              {someSelected ? (
                <>
                  <span className="text-foreground">{selected.size} selected</span>
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={removeSelected}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex-1">Member</span>
                  <span className="hidden w-28 shrink-0 md:block">Joined</span>
                  <span className="w-36 shrink-0">Role</span>
                  <span className="w-8 shrink-0" aria-hidden />
                </>
              )}
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
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {members.length === 0 ? "No members yet." : "No members match your filters."}
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {rows.map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  const editable = isRemovable(m);
                  const display = m.name || m.username || m.email;
                  const checked = selected.has(m.user_id);
                  return (
                    <li
                      key={m.user_id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        checked ? "bg-brand/6" : "hover:bg-panel/40",
                      )}
                    >
                      {canManage && (
                        <Checkbox
                          aria-label={`Select ${display}`}
                          checked={checked}
                          disabled={!editable}
                          onCheckedChange={() => toggleOne(m.user_id)}
                          className={cn(!editable && "invisible")}
                        />
                      )}
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

                      <div className="hidden w-28 shrink-0 text-sm text-muted-foreground md:block">
                        {formatJoined(m.joined_at)}
                      </div>

                      <div className="w-36 shrink-0">
                        {editable ? (
                          <RoleSelect value={m.role} onChange={(r) => changeRole(m.user_id, r)} allowOwner={isOwner} />
                        ) : (
                          <Badge variant={m.role === "owner" ? "brand" : "outline"} className="capitalize">
                            {m.role}
                          </Badge>
                        )}
                      </div>

                      <div className="w-8 shrink-0">
                        {(editable || isSelf) && (
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
                              {editable && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => remove(m.user_id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="size-4" />
                                    Remove from organization
                                  </DropdownMenuItem>
                                </>
                              )}
                              {isSelf && (
                                <>
                                  <DropdownMenuSeparator />
                                  {canLeaveSelf ? (
                                    <DropdownMenuItem
                                      onClick={leave}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <LogOut className="size-4" />
                                      Leave organization
                                    </DropdownMenuItem>
                                  ) : (
                                    <div title={leaveLockReason}>
                                      <DropdownMenuItem disabled className="text-muted-foreground">
                                        <Lock className="size-3.5" />
                                        Leave organization
                                      </DropdownMenuItem>
                                      <p className="px-2 pt-0.5 pb-1 text-xs text-muted-foreground/80">
                                        {leaveLockReason} Transfer ownership first.
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
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

          <p className="text-xs text-muted-foreground">
            {roleFilter !== "all" || query
              ? `${rows.length} of ${members.length} members`
              : `${members.length} ${members.length === 1 ? "member" : "members"}`}
          </p>
        </TabsContent>
      </Tabs>

      {/* Invite modal. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg p-6">
          <form onSubmit={submitInvites} className="space-y-4">
            <div>
              <DialogTitle>Invite people</DialogTitle>
              <DialogDescription className="mt-1.5">
                Invite by email or username, and pick a role for each. Existing Flagon users join
                right away; anyone else gets an email with a link to register and join.
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_9rem] gap-2 sm:grid">
                <Label className="text-xs text-muted-foreground">Email or username</Label>
                <Label className="text-xs text-muted-foreground">Role</Label>
              </div>
              {invites.map((row, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_auto]">
                  <Input
                    autoFocus={i === 0}
                    placeholder="person@example.com"
                    value={row.login}
                    onChange={(e) => setInvite(i, { login: e.target.value })}
                  />
                  <RoleSelect value={row.role} onChange={(r) => setInvite(i, { role: r })} allowOwner={isOwner} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setInvites((r) => r.filter((_, idx) => idx !== i))}
                    disabled={invites.length === 1}
                    aria-label="Remove row"
                    className="hidden size-9 disabled:opacity-30 sm:flex"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInvites((r) => [...r, { login: "", role: "member" }])}
                className="w-fit gap-1.5"
              >
                <UserPlus className="size-4" />
                Add more
              </Button>
            </div>

            {addError && (
              <Alert variant="destructive" className="whitespace-pre-line">
                {addError}
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || invites.every((r) => !r.login.trim())}>
                {adding ? "Sending..." : "Send invites"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingInvites({
  invites,
  loading,
  canManage,
  onRevoke,
  onInvite,
}: {
  invites: Invitation[];
  loading: boolean;
  canManage: boolean;
  onRevoke: (id: string) => void;
  onInvite?: () => void;
}) {
  if (loading) {
    return (
      <Card className="divide-y divide-hairline">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </Card>
    );
  }

  if (invites.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <MailPlus className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">No pending invitations</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Invite someone by email and they&rsquo;ll show up here until they accept. People who
          don&rsquo;t have a Flagon account yet get a registration link.
        </p>
        {onInvite && (
          <Button size="sm" className="mt-1" onClick={onInvite}>
            <Plus className="size-4" />
            Invite people
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <ul className="divide-y divide-hairline">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  {expiresLabel(inv.expires_at)}
                  {inv.inviter && <span className="truncate">&middot; invited by {inv.inviter}</span>}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {inv.role}
              </Badge>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRevoke(inv.id)}
                  aria-label={`Revoke the invitation for ${inv.email}`}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted-foreground">
        {invites.length} pending {invites.length === 1 ? "invitation" : "invitations"}
      </p>
    </div>
  );
}

// A friendly relative expiry ("expires in 6 days" / "expires today" / "expired").
function expiresLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

function RoleSelect({
  value,
  onChange,
  allowOwner,
}: {
  value: string;
  onChange: (role: string) => void;
  allowOwner: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* "viewer" is legacy (read-only membership is now the org base permission);
            still shown if an existing member somehow has it, so their role is visible. */}
        {value === "viewer" && <SelectItem value="viewer">Viewer</SelectItem>}
        <SelectItem value="member">Member</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
        {(allowOwner || value === "owner") && <SelectItem value="owner">Owner</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function initials(m: Member): string {
  const base = (m.name || m.username || m.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
