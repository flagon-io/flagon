"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Search, UserPlus } from "lucide-react";
import {
  Button,
  cn,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  toast,
  Tooltip,
  useConfirm,
} from "@flagon/design";
import { ASSIGNABLE_ORG_ROLES, orgRoleLabel } from "@/lib/roles";
import { authClient } from "@/lib/auth-client";
import { FormError } from "@/components/form-error";
import { MemberAvatar } from "@/components/member-avatar";
import { setMemberRoleAction } from "./actions";
import { InvitationsList } from "./invitations-list";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

type MembersTab = "members" | "invitations";

type MemberRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
};

// Invites go through BetterAuth, which only speaks owner/admin/member — the
// read-only roles (viewer/billing) are assigned after a person joins.
const INVITE_ROLES = ["admin", "member"] as const;
const ROLE_OPTIONS = ASSIGNABLE_ORG_ROLES.map((r) => ({ value: r.value, label: r.label }));

export function MembersManager({
  slug,
  organizationId,
  currentUserId,
  canManage,
  allowsInvites,
  planLabel,
  members,
  invitations,
  initialTab,
}: {
  slug: string;
  organizationId: string;
  currentUserId: string;
  canManage: boolean;
  allowsInvites: boolean;
  planLabel: string;
  members: MemberRow[];
  invitations: InviteRow[];
  initialTab: MembersTab;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Invitations live alongside the roster as a second tab, but only managers
  // see them (and only they have any to manage), so non-managers never get a
  // tab bar at all — just the roster, exactly as before.
  const [tab, setTab] = useState<MembersTab>(canManage ? initialTab : "members");
  // The tab badge counts invites still awaiting a response (pending), not the
  // declined/canceled history shown below them. (Expiry is a render-time concern
  // surfaced per-row in the Invitations panel, not folded into this count.)
  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.username?.toLowerCase().includes(q) ?? false),
      )
    : members;

  async function changeRole(m: MemberRow, role: string) {
    setBusy(m.memberId);
    setError(null);
    const { error } = await setMemberRoleAction(slug, m.memberId, role);
    setBusy(null);
    if (error) setError(error);
    else router.refresh();
  }

  async function remove(m: MemberRow) {
    if (
      !(await confirm({
        title: "Remove member?",
        message: (
          <>
            <strong className="text-zinc-200">{m.name}</strong> will immediately lose
            access to this organization and all of its projects. They can be invited
            back later.
          </>
        ),
        confirmLabel: "Remove member",
        tone: "danger",
      }))
    )
      return;
    setBusy(m.memberId);
    setError(null);
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: m.memberId,
      organizationId,
    });
    setBusy(null);
    if (error) setError(error.message ?? "Could not remove the member.");
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Members</h1>
          <p className="mt-1 text-sm text-zinc-500">
            People with access to this organization.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" /> Invite member
          </Button>
        ) : null}
      </div>

      {error ? <FormError>{error}</FormError> : null}

      {/* Managers get a tab bar to browse the roster and pending invitations
          side by side; everyone else just sees the roster. */}
      {canManage ? (
        <div className="flex items-center gap-1 border-b border-white/8">
          {([
            { id: "members" as const, label: "Members", count: members.length },
            { id: "invitations" as const, label: "Invitations", count: pendingCount },
          ]).map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-teal-400 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    isActive ? "bg-teal-400/10 text-teal-300" : "bg-white/6 text-zinc-400",
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === "invitations" ? (
        <InvitationsList
          slug={slug}
          organizationId={organizationId}
          invitations={invitations}
          canManage={canManage}
        />
      ) : (
      <div className="overflow-hidden rounded-xl border border-white/8 bg-white/2">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a member…"
              className="h-8 w-full rounded-md border border-white/10 bg-white/5 pr-3 pl-8 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <span className="shrink-0 text-xs text-zinc-500">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        <ul className="divide-y divide-white/8">
          {shown.map((m) => {
            const isSelf = m.userId === currentUserId;
            const isOwner = m.role === "owner";
            const editable = canManage && !isOwner && !isSelf;
            return (
              <li
                key={m.memberId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar name={m.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {m.name}
                      {isSelf ? <span className="ml-2 text-xs font-normal text-zinc-500">You</span> : null}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {m.username ? `@${m.username} · ` : ""}
                      {m.email}
                    </p>
                  </div>
                </div>

                {/* Fixed-width columns so role / actions line up down the list. */}
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                  <div className="flex w-28 justify-end">
                    {editable ? (
                      <Select
                        ariaLabel={`Role for ${m.name}`}
                        value={m.role}
                        disabled={busy === m.memberId}
                        onValueChange={(v) => changeRole(m, v)}
                        className="w-full px-2.5 py-1.5 text-xs"
                        options={ROLE_OPTIONS}
                      />
                    ) : (
                      <span className="text-xs text-zinc-400">{orgRoleLabel(m.role)}</span>
                    )}
                  </div>

                  <div className="flex w-8 justify-end">
                    {!canManage ? null : editable ? (
                      <Menu>
                        <MenuTrigger asChild>
                          <button
                            type="button"
                            disabled={busy === m.memberId}
                            aria-label={`Options for ${m.name}`}
                            className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </MenuTrigger>
                        <MenuContent align="end">
                          <MenuItem
                            onSelect={() => remove(m)}
                            className="text-red-400 data-highlighted:text-red-300"
                          >
                            Remove from organization
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    ) : (
                      // Kept visible (not hidden) so the row stays consistent; the
                      // tooltip explains why it can't be acted on.
                      <Tooltip
                        content={
                          isSelf
                            ? "You can't change your own role or remove yourself."
                            : "The organization owner can't be managed here."
                        }
                      >
                        <button
                          type="button"
                          aria-disabled="true"
                          aria-label={`Managing ${m.name} is unavailable`}
                          className="grid size-8 cursor-not-allowed place-items-center rounded-md text-zinc-700"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {shown.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">
              No members match “{query}”.
            </li>
          ) : null}
        </ul>
      </div>
      )}

      {inviteOpen ? (
        <InviteDialog
          organizationId={organizationId}
          allowsInvites={allowsInvites}
          planLabel={planLabel}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

/** Invite-by-email, in an intentional dialog (opened from the Invite button). */
function InviteDialog({
  organizationId,
  allowsInvites,
  planLabel,
  onClose,
  onInvited,
}: {
  organizationId: string;
  allowsInvites: boolean;
  planLabel: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.organization.inviteMember({
      email: email.trim(),
      role,
      organizationId,
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not send the invitation.");
      return;
    }
    toast.success(`Invitation sent to ${email.trim()}`);
    onInvited();
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Invite a member"
        description="They'll get an email invitation to join this organization."
        onClose={onClose}
      />
      {allowsInvites ? (
        <form onSubmit={submit} id="invite-form">
          <ModalBody className="flex flex-col gap-4">
            <Field label="Email address" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select
                ariaLabel="Role"
                value={role}
                onValueChange={(v) => setRole(v as (typeof INVITE_ROLES)[number])}
                options={INVITE_ROLES.map((r) => ({ value: r, label: orgRoleLabel(r) }))}
                className="w-full"
              />
            </Field>
            {error ? <FormError>{error}</FormError> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" disabled={pending || !email.trim()}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </ModalFooter>
        </form>
      ) : (
        <>
          <ModalBody>
            <p className="text-sm text-zinc-400">
              {planLabel} is limited to a single user. Upgrade this organization to add
              members, or self-host Flagon to run without a user limit.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
