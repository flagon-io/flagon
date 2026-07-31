"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { ASSIGNABLE_ORG_ROLES, orgRoleLabel } from "@/lib/roles";
import { submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { setMemberRoleAction } from "./actions";

type MemberRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
};

// Invites go through BetterAuth, which only speaks owner/admin/member — so the
// read-only roles (viewer/billing) are assigned after a person joins, via the
// role picker below (which writes the app-owned members table directly).
const INVITE_ROLES = ["admin", "member"] as const;
const ROLE_OPTIONS = ASSIGNABLE_ORG_ROLES.map((r) => ({ value: r.value, label: r.label }));

/** Invite-by-email form. Owner/admin only (the page gates rendering). */
export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(null);
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
    setOk(`Invitation sent to ${email.trim()}.`);
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-xs font-medium text-zinc-400">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Role</span>
          <Select
            ariaLabel="Role"
            value={role}
            onValueChange={(v) => setRole(v as (typeof INVITE_ROLES)[number])}
            options={INVITE_ROLES.map((r) => ({ value: r, label: orgRoleLabel(r) }))}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`${submitButtonClass} shrink-0 px-4`}
        >
          {pending ? "Sending…" : "Invite"}
        </button>
      </div>
      {error ? <FormError>{error}</FormError> : null}
      {ok ? <FormNotice>{ok}</FormNotice> : null}
    </form>
  );
}

/** The member roster, with role changes and removal for managers. */
export function MembersList({
  slug,
  organizationId,
  currentUserId,
  canManage,
  members,
}: {
  slug: string;
  organizationId: string;
  currentUserId: string;
  canManage: boolean;
  members: MemberRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(m: MemberRow, role: string) {
    setBusy(m.memberId);
    setError(null);
    // Role changes (including viewer/billing) go through the app-owned members
    // table, not BetterAuth — see settings/members/actions.ts.
    const { error } = await setMemberRoleAction(slug, m.memberId, role);
    setBusy(null);
    if (error) setError(error);
    else router.refresh();
  }

  async function remove(m: MemberRow) {
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
    <div className="flex flex-col gap-3">
      {error ? <FormError>{error}</FormError> : null}
      <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const isOwner = m.role === "owner";
          const editable = canManage && !isOwner && !isSelf;
          return (
            <li
              key={m.memberId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-100">
                  {m.name}
                  {isSelf ? (
                    <span className="ml-2 text-xs text-zinc-500">You</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {m.username ? `@${m.username} · ` : ""}
                  {m.email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {editable ? (
                  <Select
                    ariaLabel="Member role"
                    value={m.role}
                    disabled={busy === m.memberId}
                    onValueChange={(v) => changeRole(m, v)}
                    className="px-2 py-1 text-xs"
                    options={ROLE_OPTIONS}
                  />
                ) : (
                  <span className="text-xs text-zinc-400">{orgRoleLabel(m.role)}</span>
                )}
                {editable ? (
                  <button
                    type="button"
                    disabled={busy === m.memberId}
                    onClick={() => remove(m)}
                    className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
