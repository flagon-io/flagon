import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { getAuditConfig, setAuditConfig } from "@/lib/flagon-api";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const config = await getAuditConfig(slug);
    return NextResponse.json(config);
  } catch (e) {
    return routeError(e);
  }
}

export async function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { ip_disclosure?: boolean };
  try {
    const config = await setAuditConfig(slug, Boolean(body.ip_disclosure));
    return NextResponse.json(config);
  } catch (e) {
    return routeError(e, "Could not update the setting.");
  }
}
