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
  const [membersNext, setMembersNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Invitation[]>([]);
  const [pendingNext, setPendingNext] = useState<string | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("joined");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  const [addOpen, setAddOpen] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([{ login: "", role: "member" }]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Fetch one page of members. Text search (?q=) and paging (?cursor=) are both
  // server-side, so the list scales past a single response.
  const fetchMembers = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(slug)}/members?${params.toString()}`,
        { signal },
      );
      if (!res.ok) throw new Error(`members ${res.status}`);
      return (await res.json()) as { items: Member[]; next: string | null };
    },
    [slug],
  );

  // Reload page 1 for the current search term (used after a mutation).
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMembers(query.trim(), null);
      setMembers(data.items);
      setMembersNext(data.next);
    } catch {
      /* leave the current list in place */
    } finally {
      setLoading(false);
      setSelected(new Set());
    }
  }, [fetchMembers, query]);

  const fetchInvites = useCallback(
    async (cursor: string | null) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(slug)}/invitations?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`invitations ${res.status}`);
      return (await res.json()) as { items: Invitation[]; next: string | null };
    },
    [slug],
  );

  const loadInvites = useCallback(async () => {
    setPendingLoading(true);
    try {
      const data = await fetchInvites(null);
      setPending(data.items);
      setPendingNext(data.next);
    } catch {
      /* leave the current list in place */
    } finally {
      setPendingLoading(false);
    }
  }, [fetchInvites]);

  const loadMoreInvites = useCallback(async () => {
    if (!pendingNext) return;
    setPendingLoadingMore(true);
    try {
      const data = await fetchInvites(pendingNext);
      setPending((prev) => [...prev, ...data.items]);
      setPendingNext(data.next);
    } catch {
      /* leave the list as-is on failure */
    } finally {
      setPendingLoadingMore(false);
    }
  }, [fetchInvites, pendingNext]);

  // Initial load: the first page of members and of pending invitations.
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [data] = await Promise.all([fetchMembers("", null), loadInvites()]);
        setMembers(data.items);
        setMembersNext(data.next);
      } catch {
        /* leave the current list in place */
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMembers, loadInvites]);

  // Debounced server-side search over members. The first render already kicked
  // off the initial load above, so it is skipped here.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetchMembers(query.trim(), null, controller.signal);
        if (!controller.signal.aborted) {
          setMembers(data.items);
          setMembersNext(data.next);
          setSelected(new Set());
        }
      } catch {
        /* aborted or failed - leave the current list in place */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, fetchMembers]);

  const loadMoreMembers = useCallback(async () => {
    if (!membersNext) return;
    setLoadingMore(true);
    try {
      const data = await fetchMembers(query.trim(), membersNext);
      setMembers((prev) => [...prev, ...data.items]);
      setMembersNext(data.next);
    } catch {
      /* leave the list as-is on failure */
    } finally {
      setLoadingMore(false);
    }
  }, [membersNext, query, fetchMembers]);

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
    // The text box drives server-side search (see the search effect); the role
    // filter and sort below only refine the rows already loaded.
    const list = members.filter((m) => roleFilter === "all" || m.role === roleFilter);
    list.sort((a, b) => {
      if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email);
      if (sort === "role") return (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0);
      return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
    });
    return list;
  }, [members, roleFilter, sort]);

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
    await Promise.all([reload(), loadInvites()]);
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
    await reload();
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
    await reload();
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
    await reload();
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
        <TabsList>
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
            next={pendingNext}
            loadingMore={pendingLoadingMore}
            onLoadMore={loadMoreInvites}
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
          {loading ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            searching ? (
              <ListSkeleton />
            ) : (
              <Card className="px-4 py-12 text-center text-sm text-muted-foreground">
                {members.length === 0 && !query
                  ? "No members yet."
                  : "No members match your filters."}
              </Card>
            )
          ) : (
            <TableShell>
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage && (
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Select all"
                          checked={allSelected}
                          disabled={selectableRows.length === 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                    )}
                    {someSelected ? (
                      <TableHead colSpan={4}>
                        <div className="flex items-center gap-3">
                          <span className="text-foreground">{selected.size} selected</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={removeSelected}
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </Button>
                        </div>
                      </TableHead>
                    ) : (
                      <>
                        <TableHead>Member</TableHead>
                        <TableHead className="hidden w-28 md:table-cell">Joined</TableHead>
                        <TableHead className="w-36">Role</TableHead>
                        <TableHead className="w-10" />
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => {
                    const isSelf = m.user_id === currentUserId;
                    const editable = isRemovable(m);
                    const display = m.name || m.username || m.email;
                    const checked = selected.has(m.user_id);
                    return (
                      <TableRow key={m.user_id} data-state={checked ? "selected" : undefined}>
                        {canManage && (
                          <TableCell>
                            <Checkbox
                              aria-label={`Select ${display}`}
                              checked={checked}
                              disabled={!editable}
                              onCheckedChange={() => toggleOne(m.user_id)}
                              className={cn(!editable && "invisible")}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-3">
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
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {formatJoined(m.joined_at)}
                        </TableCell>
                        <TableCell>
                          {editable ? (
                            <RoleSelect value={m.role} onChange={(r) => changeRole(m.user_id, r)} allowOwner={isOwner} />
                          ) : (
                            <Badge variant={m.role === "owner" ? "brand" : "outline"} className="capitalize">
                              {m.role}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableShell>
          )}

          {membersNext && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMoreMembers} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {roleFilter !== "all"
              ? `${rows.length} of ${members.length} loaded`
              : `${members.length} ${members.length === 1 ? "member" : "members"}${membersNext ? " loaded" : ""}`}
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
  next,
  loadingMore,
  onLoadMore,
  canManage,
  onRevoke,
  onInvite,
}: {
  invites: Invitation[];
  loading: boolean;
  next: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  canManage: boolean;
  onRevoke: (id: string) => void;
  onInvite?: () => void;
}) {
  if (loading) {
    return <ListSkeleton />;
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
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invitation</TableHead>
              <TableHead className="w-28">Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Clock className="size-3.5 shrink-0" />
                        {expiresLabel(inv.expires_at)}
                        {inv.inviter && <span className="truncate">&middot; invited by {inv.inviter}</span>}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {inv.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRevoke(inv.id)}
                      aria-label={`Revoke the invitation for ${inv.email}`}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {invites.length} pending {invites.length === 1 ? "invitation" : "invitations"}
        {next ? " loaded" : ""}
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

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-hairline">{children}</div>;
}

function ListSkeleton() {
  return (
    <TableShell>
      <div className="divide-y divide-hairline">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </TableShell>
  );
}

function initials(m: Member): string {
  const base = (m.name || m.username || m.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
