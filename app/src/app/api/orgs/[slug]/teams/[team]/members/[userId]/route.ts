import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { removeTeamMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; team: string; userId: string }> },
) {
  const { slug, team, userId } = await ctx.params;
  try {
    await removeTeamMember(slug, team, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not remove team member.");
  }
}
