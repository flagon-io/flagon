"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@flagon-io/ui";
import type { Invitation, Member, Page } from "@/lib/api/types";
import { errorMessage, fetchJson, messageOf } from "@/lib/client-fetch";
import { ListError, ListSkeleton } from "@/components/shared/list-states";
import { InviteDialog } from "./members/invite-dialog";
import { MembersTable } from "./members/members-table";
import { MembersToolbar, type MemberSort } from "./members/members-toolbar";
import { PendingInvites } from "./members/pending-invites";

type Tab = "members" | "pending";

const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

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
  const orgBase = `/api/orgs/${encodeURIComponent(slug)}`;

  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [membersNext, setMembersNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Invitation[]>([]);
  const [pendingNext, setPendingNext] = useState<string | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState<MemberSort>("joined");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const firstRender = useRef(true);

  const [addOpen, setAddOpen] = useState(false);
  // Bumped when the invite dialog opens so it remounts with fresh rows.
  const [addNonce, setAddNonce] = useState(0);

  // Fetch one page of members. Text search (?q=) and paging (?cursor=) are both
  // server-side, so the list scales past a single response.
  const fetchMembers = useCallback(
    (q: string, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      return fetchJson<Page<Member>>(
        `${orgBase}/members?${params.toString()}`,
        { signal },
        "Couldn't load members.",
      );
    },
    [orgBase],
  );

  // Load page 1 for a search term. A failure is an error state, never "no members".
  const loadMembers = useCallback(
    async (q: string) => {
      try {
        const data = await fetchMembers(q, null);
        setMembers(data.items);
        setMembersNext(data.next);
        setMembersError(null);
      } catch (e) {
        setMembersError(messageOf(e, "Couldn't load members."));
      } finally {
        setLoading(false);
        setSelected(new Set());
      }
    },
    [fetchMembers],
  );

  // Reload page 1 for the current search term (after a mutation, or a retry).
  const reload = useCallback(async () => {
    setLoading(true);
    await loadMembers(query.trim());
  }, [loadMembers, query]);

  const fetchInvites = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      return fetchJson<Page<Invitation>>(
        `${orgBase}/invitations?${params.toString()}`,
        undefined,
        "Couldn't load pending invitations.",
      );
    },
    [orgBase],
  );

  const loadInvites = useCallback(async () => {
    setPendingLoading(true);
    try {
      const data = await fetchInvites(null);
      setPending(data.items);
      setPendingNext(data.next);
      setPendingError(null);
    } catch (e) {
      setPendingError(messageOf(e, "Couldn't load pending invitations."));
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
    } catch (e) {
      setError(messageOf(e, "Couldn't load more invitations."));
    } finally {
      setPendingLoadingMore(false);
    }
  }, [fetchInvites, pendingNext]);

  // Initial load: the first page of members and of pending invitations.
  useEffect(() => {
    void (async () => {
      await Promise.all([loadMembers(""), loadInvites()]);
    })();
  }, [loadMembers, loadInvites]);

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
          setMembersError(null);
          setSelected(new Set());
        }
      } catch (e) {
        // An aborted search was superseded by a newer one; anything else failed.
        if (!controller.signal.aborted) setMembersError(messageOf(e, "Couldn't load members."));
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
    } catch (e) {
      setError(messageOf(e, "Couldn't load more members."));
    } finally {
      setLoadingMore(false);
    }
  }, [membersNext, query, fetchMembers]);

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
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  }

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(`${orgBase}/members/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) setError(await errorMessage(res, "Couldn't change that role."));
    await reload();
  }

  async function removeOne(userId: string) {
    const res = await fetch(`${orgBase}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await errorMessage(res, "Couldn't remove that member."));
  }

  async function remove(userId: string) {
    setError(null);
    try {
      await removeOne(userId);
    } catch (e) {
      setError(messageOf(e, "Couldn't remove that member."));
    }
    await reload();
  }

  async function removeSelected() {
    setError(null);
    let firstErr: string | null = null;
    for (const id of [...selected]) {
      try {
        await removeOne(id);
      } catch (e) {
        if (!firstErr) firstErr = messageOf(e, "Couldn't remove some members.");
      }
    }
    if (firstErr) setError(firstErr);
    await reload();
  }

  async function revokeInvite(id: string) {
    setError(null);
    const res = await fetch(`${orgBase}/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) setError(await errorMessage(res, "Couldn't revoke that invitation."));
    await loadInvites();
  }

  async function leave() {
    setError(null);
    const res = await fetch(`${orgBase}/leave`, { method: "POST" });
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't leave the organization."));
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
            {!membersError && <Badge variant="secondary">{members.length}</Badge>}
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
            error={pendingError}
            onRetry={loadInvites}
            next={pendingNext}
            loadingMore={pendingLoadingMore}
            onLoadMore={loadMoreInvites}
            canManage={canManage}
            onRevoke={revokeInvite}
            onInvite={canManage ? openAdd : undefined}
          />
        </TabsContent>

        <TabsContent value="members" className="mt-5 space-y-4">
          <MembersToolbar
            query={query}
            onQueryChange={setQuery}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            sort={sort}
            onSortChange={setSort}
            onInvite={canManage ? openAdd : undefined}
          />

          {loading ? (
            <ListSkeleton />
          ) : membersError ? (
            <ListError title="Couldn't load members" message={membersError} onRetry={reload} />
          ) : rows.length === 0 ? (
            searching ? (
              <ListSkeleton />
            ) : (
              <Card className="px-4 py-12 text-center text-sm text-muted-foreground">
                {members.length === 0 && !query ? "No members yet." : "No members match your filters."}
              </Card>
            )
          ) : (
            <MembersTable
              rows={rows}
              selected={selected}
              allSelected={allSelected}
              selectableCount={selectableRows.length}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
              onRemoveSelected={removeSelected}
              actions={{
                canManage,
                isOwner,
                currentUserId,
                isRemovable,
                canLeaveSelf,
                leaveLockReason,
                onChangeRole: changeRole,
                onRemove: remove,
                onLeave: leave,
              }}
            />
          )}

          {!membersError && (
            <>
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
            </>
          )}
        </TabsContent>
      </Tabs>

      <InviteDialog
        key={`invite-${addNonce}`}
        open={addOpen}
        onOpenChange={setAddOpen}
        slug={slug}
        onInvited={async () => {
          await Promise.all([reload(), loadInvites()]);
        }}
      />
    </div>
  );
}
