import { NextResponse } from "next/server";
import { setTeamMemberRole } from "@/lib/flagon-api";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string; team: string; userId: string }> },
) {
  const { slug, team, userId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  if (!role) {
    return NextResponse.json({ error: "A role is required." }, { status: 400 });
  }
  try {
    await setTeamMemberRole(slug, team, userId, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not change role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
