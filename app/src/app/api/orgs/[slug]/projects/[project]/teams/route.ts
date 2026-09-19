import { NextResponse } from "next/server";
import { addProjectTeam, listProjectTeams } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  try {
    const page = await listProjectTeams(slug, project, {
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ items: page.items, next: page.next });
  } catch {
    return NextResponse.json({ items: [], next: null });
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
    return NextResponse.json({ error: "A team is required." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "A role is required." }, { status: 400 });
  }
  try {
    await addProjectTeam(slug, project, team, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not grant team access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
