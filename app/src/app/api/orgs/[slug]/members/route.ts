import { NextResponse } from "next/server";
import { addMember, listMembers } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  try {
    const page = await listMembers(slug, {
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
