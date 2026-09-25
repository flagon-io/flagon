import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { markNotificationRead } from "@/lib/flagon-api";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await markNotificationRead(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not update notification.");
  }
}
