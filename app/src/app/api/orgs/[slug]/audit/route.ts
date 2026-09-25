import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { listAuditPage } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    const page = await listAuditPage(slug, {
      q: sp.get("q") ?? undefined,
      actions: sp.getAll("action"),
      actor: sp.get("actor") ?? undefined,
      perPage: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      before: sp.get("cursor") ?? undefined,
    });
    return NextResponse.json(page);
  } catch (e) {
    return routeError(e);
  }
}
