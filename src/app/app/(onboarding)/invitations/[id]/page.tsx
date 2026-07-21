import type { Metadata } from "next";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { Mail } from "lucide-react";
import { auth } from "@/lib/auth";
import { FlagonMark } from "@/lib/logo";
import { InvitationResponse } from "./invitation-card";

export const metadata: Metadata = { title: "Invitation" };

/**
 * Invitation landing - the emailed link. The plugin only reveals an
 * invitation to a signed-in user whose primary email is the invited address
 * (with a verified email); everyone else gets the explainer instead of a
 * lookup, so invitations never leak.
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let invitation: Awaited<ReturnType<typeof auth.api.getInvitation>> | null =
    null;
  let blockedMessage: string | null = null;
  try {
    invitation = await auth.api.getInvitation({
      query: { id },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      blockedMessage = error.body?.message ?? null;
    } else {
      throw error;
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <FlagonMark className="h-10 w-10" />
      {invitation ? (
        <>
          <p className="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            Invitation
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Join {invitation.organizationName}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {invitation.inviterEmail} invited you to join{" "}
            <span className="text-zinc-200">
              {invitation.organizationName}
            </span>{" "}
            as <span className="uppercase">{invitation.role}</span>. The
            invitation was sent to{" "}
            <span className="text-zinc-200">{invitation.email}</span>.
          </p>
          <InvitationResponse invitationId={invitation.id} />
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="mt-8 flex h-12 w-12 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
          >
            <Mail className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-100">
            Can&apos;t open this invitation
          </h1>
          {/* Two paragraphs, not one sentence built by concatenation. The
              upstream message comes from BetterAuth and does not reliably end
              in a full stop, so appending our guidance to it produced
              "...for the session email Make sure you're signed in", which
              reads as a rendering fault on the first page an invited person
              ever sees. */}
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {blockedMessage
              ? blockedMessage.replace(/\s*[.!?]?\s*$/, ".")
              : "This invitation doesn't exist, has expired, or was sent to a different email address."}
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Make sure you&apos;re signed in with the account whose primary
            email received the invitation, and that the address is verified.
          </p>
        </>
      )}
    </div>
  );
}
