import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { addProjectMember, listProjectMembers } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const page = await listProjectMembers(slug, project, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
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
    return badRequest("An email or username is required.");
  }
  if (!role) {
    return badRequest("A role is required.");
  }
  try {
    await addProjectMember(slug, project, login, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not add collaborator.");
  }
}
