import { NextResponse } from "next/server";
import { removeMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; userId: string }> },
) {
  const { slug, userId } = await ctx.params;
  try {
    await removeMember(slug, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
