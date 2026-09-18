import { NextResponse } from "next/server";
import { getProject } from "@/lib/flagon-api";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const found = await getProject(slug, project);
    if (!found) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json(found);
  } catch {
    return NextResponse.json({ error: "Could not load the project." }, { status: 500 });
  }
}
