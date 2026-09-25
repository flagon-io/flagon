import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { inviteMember, listInvitations } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const page = await listInvitations(slug, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const role = typeof body.role === "string" ? body.role : "member";
  if (!login) {
    return badRequest("An email or username is required.");
  }

  try {
    const result = await inviteMember(slug, login, role);

    // Existing user: they were added straight away.
    if (result.status === "added") {
      return NextResponse.json({ status: "added" }, { status: 201 });
    }

    // New invitation: the API emails the single-use link itself (the same for
    // every front door: REST, the agent, MCP), so the app never sends a copy.
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const url = result.token ? `${base}/invite/${result.token}` : undefined;
    // When the email did not go out (no mail provider, the log mailer, or a
    // delivery failure), hand the link back so the inviter can share it; the
    // dialog shows it with a copy button. Dev always gets it, for convenience.
    const emailFailed = !result.email_sent;
    const inviteUrl = emailFailed || process.env.NODE_ENV !== "production" ? url : undefined;
    return NextResponse.json(
      { status: "invited", email: result.email, emailFailed, inviteUrl },
      { status: 201 },
    );
  } catch (e) {
    return routeError(e, "Could not send the invitation.");
  }
}
