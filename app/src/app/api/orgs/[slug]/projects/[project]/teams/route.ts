import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { addProjectTeam, listProjectTeams } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const page = await listProjectTeams(slug, project, listOptionsFrom(request));
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
  const team = typeof body.team === "string" ? body.team.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!team) {
    return badRequest("A team is required.");
  }
  if (!role) {
    return badRequest("A role is required.");
  }
  try {
    await addProjectTeam(slug, project, team, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not grant team access.");
  }
}
