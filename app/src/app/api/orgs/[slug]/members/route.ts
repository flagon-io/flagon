import { NextResponse } from "next/server";
import { addMember, listMembers } from "@/lib/flagon-api";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const members = await listMembers(slug);
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ members: [] });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const role = typeof body.role === "string" ? body.role : "member";
  if (!login) {
    return NextResponse.json({ error: "An email or username is required." }, { status: 400 });
  }
  try {
    await addMember(slug, login, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
