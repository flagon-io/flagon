import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { leaveOrg } from "@/lib/flagon-api";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    await leaveOrg(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not leave organization.");
  }
}
