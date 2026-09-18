import { NextResponse } from "next/server";
import { getAuditConfig, setAuditConfig } from "@/lib/flagon-api";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const config = await getAuditConfig(slug).catch(() => ({ ip_disclosure: false }));
  return NextResponse.json(config);
}

export async function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { ip_disclosure?: boolean };
  try {
    const config = await setAuditConfig(slug, Boolean(body.ip_disclosure));
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the setting." },
      { status: 400 },
    );
  }
}
