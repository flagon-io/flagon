import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { setMemberRole } from "@/lib/flagon-api";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string; userId: string }> },
) {
  const { slug, userId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  if (!role) {
    return badRequest("A role is required.");
  }
  try {
    await setMemberRole(slug, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not change role.");
  }
}
