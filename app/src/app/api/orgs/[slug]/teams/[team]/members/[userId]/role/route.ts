import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { setTeamMemberRole } from "@/lib/flagon-api";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string; userId: string }> },
) {
  const { slug, team, userId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  if (!role) {
    return badRequest("A role is required.");
  }
  try {
    await setTeamMemberRole(slug, team, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not change role.");
  }
}
