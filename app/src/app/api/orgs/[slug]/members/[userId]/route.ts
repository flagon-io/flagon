import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { removeMember } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; userId: string }> },
) {
  const { slug, userId } = await ctx.params;
  try {
    await removeMember(slug, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not remove member.");
  }
}
