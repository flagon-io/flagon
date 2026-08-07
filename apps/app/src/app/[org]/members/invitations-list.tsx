"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { cn, toast, useConfirm } from "@flagon/design";
import { orgRoleLabel } from "@/lib/roles";
import { authClient } from "@/lib/auth-client";
import { FormError } from "@/components/form-error";
import { clearInvitationsAction } from "./actions";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

/** What actually became of an invite, collapsing status + expiry into one state. */
type InviteState = "active" | "expired" | "rejected" | "canceled";

function inviteState(i: InviteRow): InviteState {
  if (i.status === "pending") {
    return new Date(i.expiresAt).getTime() < Date.now() ? "expired" : "active";
  }
  return i.status === "rejected" ? "rejected" : "canceled";
}

/**
 * The invitations panel of the Members area. Active invites (awaiting a response)
 * sit up top where a manager can cancel them; below is the history of ones that
 * never landed (expired, declined, or canceled), each of which can be re-sent or
 * cleared away, with a "Clear all" to wipe the whole history at once. Accepted
 * invites aren't here: those people are in the roster.
 */
export function InvitationsList({
  slug,
  organizationId,
  invitations,
  canManage,
}: {
  slug: string;
  organizationId: string;
  invitations: InviteRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(invite: InviteRow) {
    if (
      !(await confirm({
        title: "Cancel invitation?",
        message: (
          <>
            The pending invitation for{" "}
            <strong className="text-zinc-200">{invite.email}</strong> will be
            revoked. Its link will stop working.
          </>
        ),
        confirmLabel: "Cancel invitation",
        tone: "danger",
      }))
    )
      return;
    setBusy(invite.id);
    setError(null);
    const { error } = await authClient.organization.cancelInvitation({
      invitationId: invite.id,
    });
    setBusy(null);
    if (error) setError(error.message ?? "Could not cancel the invitation.");
    else router.refresh();
  }

  async function resend(invite: InviteRow) {
    setBusy(invite.id);
    setError(null);
    // `resend` re-sends (and refreshes the window) when a pending invite already
    // exists; for a declined/canceled one it just sends a fresh invitation.
    const { error } = await authClient.organization.inviteMember({
      email: invite.email,
      role: invite.role as "admin" | "member",
      organizationId,
      resend: true,
    });
    setBusy(null);
    if (error) {
      setError(error.message ?? "Could not resend the invitation.");
      return;
    }
    toast.success(`Invitation resent to ${invite.email}`);
    router.refresh();
  }

  function clear(ids: string[]) {
    setError(null);
    start(async () => {
      const { error } = await clearInvitationsAction(slug, ids);
      if (error) {
        setError(error);
        return;
      }
      router.refresh();
    });
  }

  // Server hands them back newest-first; keep that order within each group.
  const active = invitations.filter((i) => inviteState(i) === "active");
  const history = invitations.filter((i) => inviteState(i) !== "active");

  async function clearAll() {
    if (
      !(await confirm({
        title: "Clear invitation history?",
        message: `All ${history.length} not-accepted ${history.length === 1 ? "invitation" : "invitations"} will be removed from the list. This can't be undone, but you can always invite anyone again.`,
        confirmLabel: "Clear all",
        tone: "danger",
      }))
    )
      return;
    clear(history.map((i) => i.id));
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/12 bg-white/2 px-4 py-10 text-center">
        <Mail className="size-5 text-zinc-600" />
        <p className="text-sm text-zinc-300">No invitations yet</p>
        <p className="max-w-sm text-xs text-zinc-500">
          Use <span className="text-zinc-300">Invite member</span> to add
          teammates. Their invitation appears here until they accept it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormError>{error}</FormError> : null}

      <Section title="Pending" count={active.length} emptyHint="No invitations are awaiting a response.">
        {active.map((i) => (
          <InviteItem
            key={i.id}
            invite={i}
            busy={busy === i.id}
            disabled={pending}
            canManage={canManage}
            onCancel={cancel}
            onResend={resend}
            onClear={(id) => clear([id])}
          />
        ))}
      </Section>

      {history.length > 0 ? (
        <Section
          title="Not accepted"
          count={history.length}
          action={
            canManage ? (
              <button
                type="button"
                disabled={pending}
                onClick={clearAll}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                Clear all
              </button>
            ) : null
          }
        >
          {history.map((i) => (
            <InviteItem
              key={i.id}
              invite={i}
              busy={busy === i.id}
              disabled={pending}
              canManage={canManage}
              onCancel={cancel}
              onResend={resend}
              onClear={(id) => clear([id])}
            />
          ))}
        </Section>
      ) : null}

      {confirmDialog}
    </div>
  );
}

/** A labelled group with a count, an optional right-aligned action, and a list. */
function Section({
  title,
  count,
  emptyHint,
  action,
  children,
}: {
  title: string;
  count: number;
  emptyHint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
          {title} · {count}
        </p>
        {count > 0 ? action : null}
      </div>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/2 px-4 py-6 text-center text-xs text-zinc-500">
          {emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/8 overflow-hidden rounded-xl border border-white/8 bg-white/2">
          {children}
        </ul>
      )}
    </div>
  );
}

function InviteItem({
  invite,
  busy,
  disabled,
  canManage,
  onCancel,
  onResend,
  onClear,
}: {
  invite: InviteRow;
  busy: boolean;
  disabled: boolean;
  canManage: boolean;
  onCancel: (i: InviteRow) => void;
  onResend: (i: InviteRow) => void;
  onClear: (id: string) => void;
}) {
  const state = inviteState(invite);
  const faded = state !== "active";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full bg-white/5",
            faded ? "text-zinc-600" : "text-zinc-500",
          )}
        >
          <Mail className="size-4" />
        </span>
        <div className="min-w-0">
          <p className={cn("truncate text-sm", faded ? "text-zinc-400" : "text-zinc-100")}>
            {invite.email}
          </p>
          <p className="text-xs text-zinc-500">Invited as {orgRoleLabel(invite.role)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StateBadge invite={invite} state={state} />
        {canManage ? (
          <div className="flex items-center gap-3">
            {state === "active" ? (
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => onCancel(invite)}
                className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => onResend(invite)}
                  className="text-xs font-medium text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  {busy ? "Resending…" : "Resend"}
                </button>
                <button
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => onClear(invite.id)}
                  className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function StateBadge({ invite, state }: { invite: InviteRow; state: InviteState }) {
  if (state === "active") {
    return (
      <span className="text-xs text-zinc-500">
        Expires {new Date(invite.expiresAt).toLocaleDateString()}
      </span>
    );
  }
  const styles: Record<Exclude<InviteState, "active">, { label: string; className: string }> = {
    expired: {
      label: "Expired",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    },
    rejected: {
      label: "Declined",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    },
    canceled: {
      label: "Canceled",
      className: "border-white/12 bg-white/5 text-zinc-400",
    },
  };
  const { label, className } = styles[state];
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        className,
      )}
    >
      {label}
    </span>
  );
}
