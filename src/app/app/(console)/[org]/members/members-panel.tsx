"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, UserRound, X } from "lucide-react";
import {
  ASSIGNABLE_ORG_ROLES,
  ORG_ROLE_DESCRIPTIONS,
  ORG_ROLE_LABELS,
  TRANSFER_OWNERSHIP_HINT,
  type OrgRole,
} from "@/lib/org-roles";
import {
  Notice,
  buttonClass,
  hintClass,
  subtleButtonClass,
} from "@/components/form-ui";
import { Input, Label, Select } from "@/ui";
import {
  cancelInvitationAction,
  inviteMemberAction,
  removeMemberAction,
  transferOwnershipAction,
  updateMemberRoleAction,
} from "./actions";

export type PanelMember = {
  memberId: string;
  userId: string;
  username: string | null;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export type PanelInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

// Ownership is transferred, not assigned, so it is never an option here.
const ROLE_OPTIONS = ASSIGNABLE_ORG_ROLES.map((role) => ({
  value: role,
  label: ORG_ROLE_LABELS[role],
}));

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Members + pending invitations, with the invite form on top. Invite by
 * username (existing account, routed to its primary email) or by email.
 * Owners/admins manage roles inline and remove members; everyone else sees
 * the read-only roster. Member names link to their profile page.
 */
export function MembersPanel({
  orgSlug,
  viewerUserId,
  members,
  invitations,
  canManage,
}: {
  orgSlug: string;
  viewerUserId: string;
  members: PanelMember[];
  invitations: PanelInvitation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);

  const isOwner =
    members.find((member) => member.userId === viewerUserId)?.role === "owner";
  const transferable = members.filter(
    (member) => member.userId !== viewerUserId,
  );

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await inviteMemberAction(orgSlug, { identifier, role });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setIdentifier("");
    router.refresh();
  }

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {canManage ? (
        <form
          onSubmit={invite}
          className="flex flex-wrap items-end gap-3 border border-white/10 bg-white/2 p-4"
        >
          <div className="min-w-56 flex-1">
            <Label htmlFor="invite-identifier">Username or email</Label>
            <Input
              id="invite-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="robin, or robin@flagon.io"
              required
            />
          </div>
          <div className="w-32">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              id="invite-role"
              value={role}
              onValueChange={setRole}
              options={ROLE_OPTIONS}
            />
          </div>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Inviting..." : "Invite"}
          </button>
          <p className={`${hintClass} w-full`}>
            Existing accounts get the invitation at their primary email; new
            people sign up with the invited address, then accept.
          </p>
        </form>
      ) : null}

      {invitations.length ? (
        <>
          <h2 className="mt-8 text-sm font-semibold text-zinc-100">
            Pending invitations
          </h2>
          <ul className="mt-3 divide-y divide-white/5 border border-white/10">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
                >
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {invitation.email}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Invited as {invitation.role} · expires{" "}
                    {dateFormat.format(new Date(invitation.expiresAt))}
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() =>
                      run(() => cancelInvitationAction(orgSlug, invitation.id))
                    }
                    aria-label={`Cancel invitation for ${invitation.email}`}
                    className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mt-8 text-sm font-semibold text-zinc-100">Members</h2>
      <ul className="mt-3 divide-y divide-white/5 border border-white/10">
        {members.map((member) => {
          const isViewer = member.userId === viewerUserId;
          return (
            <li
              key={member.memberId}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
              >
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">
                  {member.username ? (
                    <Link
                      href={appPath(`/${orgSlug}/members/${member.username}`)}
                      className="transition hover:text-teal-300 hover:underline"
                    >
                      {member.name}
                    </Link>
                  ) : (
                    member.name
                  )}
                  {isViewer ? (
                    <span className="ml-2 text-xs text-zinc-500">(you)</span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">
                  {member.username ? `${member.username} · ` : ""}
                  {member.email} · joined{" "}
                  {dateFormat.format(new Date(member.createdAt))}
                </div>
              </div>
              {/* The owner's seat is not editable here: it moves only by
                  transferring ownership, and the owner can't be removed. */}
              {canManage && !isViewer && member.role !== "owner" ? (
                <>
                  <div className="w-32">
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        run(() =>
                          updateMemberRoleAction(
                            orgSlug,
                            member.memberId,
                            value,
                          ),
                        )
                      }
                      options={ROLE_OPTIONS}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      run(() => removeMemberAction(orgSlug, member.memberId))
                    }
                    aria-label={`Remove ${member.name}`}
                    className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : (
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  {ORG_ROLE_LABELS[member.role as OrgRole] ?? member.role}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <div className="mt-10 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">
            Transfer ownership
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            {ORG_ROLE_DESCRIPTIONS.owner} {TRANSFER_OWNERSHIP_HINT}
          </p>
          {transferable.length ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Label htmlFor="transfer-owner">New owner</Label>
                <Select
                  id="transfer-owner"
                  value={transferTo}
                  onValueChange={(value) => {
                    setTransferTo(value);
                    setConfirmingTransfer(false);
                  }}
                  placeholder="Choose a member"
                  options={transferable.map((member) => ({
                    value: member.userId,
                    label: member.name,
                  }))}
                />
              </div>
              {confirmingTransfer ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingTransfer(false);
                      run(() => transferOwnershipAction(orgSlug, transferTo));
                    }}
                    className={buttonClass}
                  >
                    Yes, transfer ownership
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingTransfer(false)}
                    className="text-sm text-zinc-500 transition hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!transferTo}
                  onClick={() => setConfirmingTransfer(true)}
                  className={subtleButtonClass}
                >
                  Transfer ownership
                </button>
              )}
            </div>
          ) : (
            <p className={`${hintClass} mt-3`}>
              Invite someone first: ownership can only move to an existing
              member.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
