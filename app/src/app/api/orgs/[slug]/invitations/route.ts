import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { inviteMember, listInvitations } from "@/lib/flagon-api";
import { sendInviteEmail } from "@/lib/mailer";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const invitations = await listInvitations(slug);
    return NextResponse.json({ invitations });
  } catch {
    return NextResponse.json({ invitations: [] });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const role = typeof body.role === "string" ? body.role : "member";
  if (!login) {
    return NextResponse.json({ error: "An email or username is required." }, { status: 400 });
  }

  try {
    const result = await inviteMember(slug, login, role);

    // Existing user: they were added straight away.
    if (result.status === "added") {
      return NextResponse.json({ status: "added" }, { status: 201 });
    }

    // New invitation: email the single-use link. The link doubles as email
    // verification, so the invitee can register and join in one step.
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const url = `${base}/invite/${result.token}`;
    const session = await auth.api.getSession({ headers: await headers() });
    const inviter = session?.user?.name || undefined;
    // In dev (no mail provider) the link only reaches the server log, so also
    // hand it back to the inviter so they can share it while testing.
    const devUrl = process.env.NODE_ENV !== "production" ? url : undefined;

    try {
      await sendInviteEmail(result.email!, { url, orgName: result.org_name ?? slug, inviter, role });
    } catch {
      // The invitation exists; only delivery failed. Let the inviter copy the
      // link so a missing mail provider doesn't strand the invite.
      return NextResponse.json(
        { status: "invited", email: result.email, emailFailed: true, inviteUrl: url },
        { status: 201 },
      );
    }

    return NextResponse.json({ status: "invited", email: result.email, inviteUrl: devUrl }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
