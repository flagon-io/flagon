"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { FormError } from "@/components/form-error";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

export function InvitationsList({
  invitations,
  canManage,
}: {
  invitations: InviteRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
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
    const id = invite.id;
    setBusy(id);
    setError(null);
    const { error } = await authClient.organization.cancelInvitation({
      invitationId: id,
    });
    setBusy(null);
    if (error) setError(error.message ?? "Could not cancel the invitation.");
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormError>{error}</FormError> : null}
      <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
        {invitations.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-100">{i.email}</p>
              <p className="text-xs text-zinc-500">
                {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                disabled={busy === i.id}
                onClick={() => cancel(i)}
                className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {confirmDialog}
    </div>
  );
}
