import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getInvitation } from "@/lib/flagon-api";
import { AuthCard } from "@/components/auth/auth-card";
import { InviteFlow } from "./invite-flow";

export const metadata = { title: "Join an organization on Flagon" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [invite, session] = await Promise.all([
    getInvitation(token).catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!invite) {
    return (
      <AuthCard
        title="Invitation not found"
        subtitle="This invite link is invalid. Ask whoever invited you to send a new one."
        footer={<BackToFlagon />}
      >
        <span />
      </AuthCard>
    );
  }

  if (invite.status !== "pending" || invite.expired) {
    const reason =
      invite.status === "accepted"
        ? "This invitation has already been accepted."
        : invite.status === "revoked"
          ? "This invitation was revoked."
          : "This invitation has expired.";
    return (
      <AuthCard
        title={`Join ${invite.org_name}`}
        subtitle={`${reason} Ask whoever invited you to send a new one.`}
        footer={<BackToFlagon />}
      >
        <span />
      </AuthCard>
    );
  }

  const sessionEmail = session?.user?.email ?? null;

  return (
    <InviteFlow
      token={token}
      invite={invite}
      signedIn={Boolean(session)}
      sessionEmail={sessionEmail}
    />
  );
}

function BackToFlagon() {
  return (
    <>
      Go to{" "}
      <Link href="/" className="font-medium text-link underline">
        Flagon
      </Link>
    </>
  );
}
