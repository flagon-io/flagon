import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { removeProjectTeam } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; team: string }> },
) {
  const { slug, project, team } = await ctx.params;
  try {
    await removeProjectTeam(slug, project, team);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not revoke team access.");
  }
}
