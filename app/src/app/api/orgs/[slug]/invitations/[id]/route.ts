import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { revokeInvitation } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  try {
    await revokeInvitation(slug, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not revoke the invitation.");
  }
}
