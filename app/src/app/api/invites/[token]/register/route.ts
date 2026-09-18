import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { syncPrimaryUserEmail } from "@/lib/user-emails";
import { getInvitation, acceptInvitationAs } from "@/lib/flagon-api";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

// Register a brand-new account straight from an invitation and join the org in
// one step. The invite link is proof the person controls the invited mailbox,
// so the account's email is marked verified without a separate OTP round-trip
// ("the invite is a form of verification"). The email is taken from the invite,
// never the client, so it can't be swapped.
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // The invite must still be usable, and it decides the email.
  const invite = await getInvitation(token).catch(() => null);
  if (!invite || invite.status !== "pending" || invite.expired) {
    return NextResponse.json({ error: "This invitation is no longer valid." }, { status: 410 });
  }
  const email = invite.email;

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-30 characters: letters, numbers, hyphens, or underscores." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // 1. Create the account (this mirrors the profile + seeds the primary email).
  let userId: string;
  try {
    const result = await auth.api.signUpEmail({ body: { name, username, email, password } });
    userId = result.user.id;
  } catch (err) {
    const message =
      err instanceof APIError ? err.message : "Could not create your account. Try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 2. The invitation verifies the email: mark it verified so sign-in works and
  //    no OTP step is needed.
  try {
    await pool.query(`UPDATE users SET "emailVerified" = true, "updatedAt" = now() WHERE id = $1`, [
      userId,
    ]);
    await syncPrimaryUserEmail(userId, email, true);
  } catch {
    return NextResponse.json({ error: "Could not finish setting up your account." }, { status: 500 });
  }

  // 3. Join the org. We forward the freshly created identity directly (the
  //    session cookie isn't on this request yet).
  let orgSlug: string;
  try {
    const joined = await acceptInvitationAs({ id: userId, email }, token);
    orgSlug = joined.org_slug;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not join the organization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 4. Sign them in and forward the session cookie on our JSON response, so the
  //    client can redirect straight into the org.
  const out = NextResponse.json({ org_slug: orgSlug });
  try {
    const signIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    for (const cookie of signIn.headers.getSetCookie()) {
      out.headers.append("set-cookie", cookie);
    }
  } catch {
    // Account + membership exist; they can just log in. Tell the client to route
    // to login rather than the org.
    return NextResponse.json({ org_slug: orgSlug, signedIn: false }, { status: 200 });
  }
  return out;
}
