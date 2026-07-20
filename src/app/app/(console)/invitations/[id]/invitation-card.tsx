"use client";

import { useState } from "react";
import { Notice, buttonClass, subtleButtonClass } from "@/components/form-ui";
import {
  acceptInvitationAction,
  declineInvitationAction,
} from "./actions";

/** Accept/decline controls; server actions redirect on success. */
export function InvitationResponse({ invitationId }: { invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  async function respond(kind: "accept" | "decline") {
    setError(null);
    setPending(kind);
    const action =
      kind === "accept" ? acceptInvitationAction : declineInvitationAction;
    const result = await action(invitationId);
    // On success the action redirects; reaching here means it failed.
    setPending(null);
    if (result && !result.ok) setError(result.message);
  }

  return (
    <div className="mt-6">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => respond("accept")}
          className={buttonClass}
        >
          {pending === "accept" ? "Joining..." : "Accept invitation"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => respond("decline")}
          className={subtleButtonClass}
        >
          {pending === "decline" ? "Declining..." : "Decline"}
        </button>
      </div>
    </div>
  );
}
