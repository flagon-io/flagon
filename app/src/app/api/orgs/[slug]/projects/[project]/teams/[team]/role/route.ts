import { NextResponse } from "next/server";
import { setProjectTeamRole } from "@/lib/flagon-api";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string; team: string }> },
) {
  const { slug, project, team } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  if (!role) {
    return NextResponse.json({ error: "A role is required." }, { status: 400 });
  }
  try {
    await setProjectTeamRole(slug, project, team, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not change team role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
