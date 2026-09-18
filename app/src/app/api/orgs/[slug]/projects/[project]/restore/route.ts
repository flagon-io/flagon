import { NextResponse } from "next/server";
import { restoreProject } from "@/lib/flagon-api";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const restored = await restoreProject(slug, project);
    return NextResponse.json(restored);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not restore the project." },
      { status: 400 },
    );
  }
}
