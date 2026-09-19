import { NextResponse } from "next/server";
import { createTeam, listTeams } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  try {
    const page = await listTeams(slug, {
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ items: page.items, next: page.next });
  } catch {
    return NextResponse.json({ items: [], next: null });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "A team name is required." }, { status: 400 });
  }
  try {
    const team = await createTeam(slug, {
      name,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
    });
    return NextResponse.json(team, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create team.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
