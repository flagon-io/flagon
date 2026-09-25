import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { restoreProject } from "@/lib/flagon-api";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const newSlug = typeof body?.slug === "string" && body.slug.trim() ? body.slug.trim() : undefined;
  try {
    const restored = await restoreProject(slug, project, newSlug);
    return NextResponse.json(restored);
  } catch (e) {
    return routeError(e, "Could not restore the project.");
  }
}
