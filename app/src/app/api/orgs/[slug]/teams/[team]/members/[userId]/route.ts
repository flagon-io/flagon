import { NextResponse } from "next/server";
import { removeTeamMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; team: string; userId: string }> },
) {
  const { slug, team, userId } = await ctx.params;
  try {
    await removeTeamMember(slug, team, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove team member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
