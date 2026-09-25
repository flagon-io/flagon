import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { addTeamMember, listTeamMembers } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
  try {
    const page = await listTeamMembers(slug, team, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
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
    await addTeamMember(slug, team, login, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not add team member.");
  }
}
