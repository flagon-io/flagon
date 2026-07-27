import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { getInvitationById } from "@/lib/org";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/form-error";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Accept invitation" };

/**
 * The invitation accept page, reachable signed in or out. Signed-out visitors
 * are pointed at sign in / sign up (preserving the invite link so they return
 * here). Signed-in visitors see the org and can accept or decline.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invitation = await getInvitationById(id);
  const session = await getSession();

  const invalid = !invitation || invitation.status !== "pending";

  return (
    <AuthShell
      title={
        invalid
          ? "Invitation unavailable"
          : `Join ${invitation!.orgName}`
      }
      subtitle={
        invalid
          ? undefined
          : `You have been invited to join ${invitation!.orgName} on ${brand.name}.`
      }
      footer={
        !session ? (
          <>
            {"Already have an account? "}
            <Link
              href={`/login?redirect=/invite/${id}`}
              className="text-teal-400 transition-colors hover:text-teal-300"
            >
              Sign in
            </Link>
          </>
        ) : null
      }
    >
      {invalid ? (
        <FormError>
          This invitation is no longer valid. It may have been cancelled,
          already accepted, or expired.
        </FormError>
      ) : session ? (
        <AcceptInvite
          invitationId={id}
          orgSlug={invitation!.orgSlug}
          invitedEmail={invitation!.email}
          currentEmail={session.user.email}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-400">
            Sign in or create an account with{" "}
            <span className="font-medium text-zinc-200">
              {invitation!.email}
            </span>{" "}
            to accept this invitation.
          </p>
          <Link
            href={`/login?redirect=/invite/${id}`}
            className="rounded-md bg-teal-500 px-4 py-2.5 text-center text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Sign in to accept
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-white/10 px-4 py-2.5 text-center text-sm text-zinc-200 transition-colors hover:border-white/20"
          >
            Create an account
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
