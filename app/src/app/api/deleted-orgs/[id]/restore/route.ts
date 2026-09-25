import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { restoreOrg } from "@/lib/flagon-api";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  try {
    const org = await restoreOrg(id, slug || undefined);
    return NextResponse.json(org);
  } catch (e) {
    return routeError(e, "Could not restore the organization.");
  }
}
