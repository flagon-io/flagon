import { NextResponse } from "next/server";
import { routeError, listOptionsFrom } from "@/lib/route-error";
import { listDeletedProjects } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const page = await listDeletedProjects(slug, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}
