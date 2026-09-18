import { NextResponse } from "next/server";
import { revokeInvitation } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  try {
    await revokeInvitation(slug, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not revoke the invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
