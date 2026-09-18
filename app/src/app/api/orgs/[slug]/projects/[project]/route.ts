import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject, type UpdateProjectBody } from "@/lib/flagon-api";

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

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as UpdateProjectBody;
  try {
    const updated = await updateProject(slug, project, body);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the project." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    await deleteProject(slug, project);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not delete the project." },
      { status: 400 },
    );
  }
}
