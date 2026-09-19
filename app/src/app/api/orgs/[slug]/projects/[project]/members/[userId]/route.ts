import { NextResponse } from "next/server";
import { removeProjectMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; userId: string }> },
) {
  const { slug, project, userId } = await ctx.params;
  try {
    await removeProjectMember(slug, project, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove collaborator.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
