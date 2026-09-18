import { NextResponse } from "next/server";
import { leaveOrg } from "@/lib/flagon-api";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    await leaveOrg(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not leave organization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
