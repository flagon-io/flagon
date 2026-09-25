import { NextResponse } from "next/server";
import { routeError, listOptionsFrom } from "@/lib/route-error";
import { listTeamProjects } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
  try {
    const page = await listTeamProjects(slug, team, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}
