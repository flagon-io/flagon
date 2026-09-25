import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { revokePAT } from "@/lib/flagon-api";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await revokePAT(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not revoke token.");
  }
}
