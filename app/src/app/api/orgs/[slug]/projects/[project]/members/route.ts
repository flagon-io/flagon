import { NextResponse } from "next/server";
import { addProjectMember, listProjectMembers } from "@/lib/flagon-api";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const members = await listProjectMembers(slug, project);
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ members: [] });
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!login) {
    return NextResponse.json({ error: "An email or username is required." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "A role is required." }, { status: 400 });
  }
  try {
    await addProjectMember(slug, project, login, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add collaborator.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
