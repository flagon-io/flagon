import { NextResponse } from "next/server";
import { acceptInvitation } from "@/lib/flagon-api";

// Accept an invitation as the currently signed-in user (their email must match
// the address the invite was sent to; the API enforces that).
export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const result = await acceptInvitation(token);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not accept the invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
