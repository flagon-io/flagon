import { NextResponse } from "next/server";
import { revokePAT } from "@/lib/flagon-api";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await revokePAT(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not revoke token.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
