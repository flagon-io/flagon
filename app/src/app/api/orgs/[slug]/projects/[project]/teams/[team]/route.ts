import { NextResponse } from "next/server";
import { removeProjectTeam } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; team: string }> },
) {
  const { slug, project, team } = await ctx.params;
  try {
    await removeProjectTeam(slug, project, team);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not revoke team access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
