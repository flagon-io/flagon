import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { removeProjectMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; userId: string }> },
) {
  const { slug, project, userId } = await ctx.params;
  try {
    await removeProjectMember(slug, project, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not remove collaborator.");
  }
}
