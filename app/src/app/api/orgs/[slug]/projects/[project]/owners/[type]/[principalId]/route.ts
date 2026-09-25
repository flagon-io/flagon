import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { removeProjectOwner } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; type: string; principalId: string }> },
) {
  const { slug, project, type, principalId } = await ctx.params;
  if (type !== "user" && type !== "team") {
    return badRequest("Invalid owner type.");
  }
  try {
    await removeProjectOwner(slug, project, type, principalId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not remove owner.");
  }
}
