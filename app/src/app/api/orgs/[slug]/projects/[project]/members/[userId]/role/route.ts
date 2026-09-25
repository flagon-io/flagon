import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { setProjectMemberRole } from "@/lib/flagon-api";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string; userId: string }> },
) {
  const { slug, project, userId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  if (!role) {
    return badRequest("A role is required.");
  }
  try {
    await setProjectMemberRole(slug, project, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not change role.");
  }
}
