import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/flagon-api";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await markNotificationRead(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update notification." }, { status: 400 });
  }
}
