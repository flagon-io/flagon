import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { addMember, listMembers } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const page = await listMembers(slug, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const role = typeof body.role === "string" ? body.role : "member";
  if (!login) {
    return badRequest("An email or username is required.");
  }
  try {
    await addMember(slug, login, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not add member.");
  }
}
