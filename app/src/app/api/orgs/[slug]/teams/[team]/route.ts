import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { deleteTeam, getTeam, updateTeam } from "@/lib/flagon-api";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
  try {
    const found = await getTeam(slug, team);
    if (!found) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    return NextResponse.json(found);
  } catch (e) {
    return routeError(e, "Could not load team.");
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    const updated = await updateTeam(slug, team, {
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return routeError(e, "Could not update team.");
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; team: string }> },
) {
  const { slug, team } = await ctx.params;
  try {
    await deleteTeam(slug, team);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not delete team.");
  }
}
