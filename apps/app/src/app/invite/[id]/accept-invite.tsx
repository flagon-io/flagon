"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { submitButtonClass } from "@/components/field";
import { FormError } from "@/components/form-error";

/**
 * Accept or decline an invitation as the signed-in user. If the signed-in
 * address differs from the invited one we say so (the invite was addressed to a
 * specific email), but still allow accepting; the server has the final say.
 */
export function AcceptInvite({
  invitationId,
  orgSlug,
  invitedEmail,
  currentEmail,
}: {
  invitationId: string;
  orgSlug: string;
  invitedEmail: string;
  currentEmail: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mismatch = invitedEmail.toLowerCase() !== currentEmail.toLowerCase();

  async function accept() {
    setPending("accept");
    setError(null);
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (error) {
      setError(error.message ?? "Could not accept this invitation.");
      setPending(null);
      return;
    }
    await authClient.organization.setActive({ organizationSlug: orgSlug });
    router.push(`/${orgSlug}`);
    router.refresh();
  }

  async function reject() {
    setPending("reject");
    setError(null);
    const { error } = await authClient.organization.rejectInvitation({
      invitationId,
    });
    setPending(null);
    if (error) {
      setError(error.message ?? "Could not decline this invitation.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-3">
      {mismatch ? (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs/5 text-amber-300">
          This invitation was sent to {invitedEmail}, but you are signed in as{" "}
          {currentEmail}.
        </p>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <button
        type="button"
        onClick={accept}
        disabled={pending !== null}
        className={submitButtonClass}
      >
        {pending === "accept" ? "Joining…" : "Accept invitation"}
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={pending !== null}
        className="rounded-md border border-white/10 px-4 py-2.5 text-center text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
      >
        {pending === "reject" ? "Declining…" : "Decline"}
      </button>
    </div>
  );
}
