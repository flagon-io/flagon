import { NextResponse } from "next/server";
import { addProjectOwner, listProjectOwners } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  try {
    const page = await listProjectOwners(slug, project, {
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
  const type = body.type === "user" || body.type === "team" ? body.type : "";
  const login = typeof body.login === "string" ? body.login.trim() : "";
  if (!type) {
    return NextResponse.json({ error: "An owner type is required." }, { status: 400 });
  }
  if (!login) {
    return NextResponse.json({ error: "A user or team is required." }, { status: 400 });
  }
  try {
    await addProjectOwner(slug, project, type, login);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add owner.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
