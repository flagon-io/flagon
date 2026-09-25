import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { addProjectOwner, listProjectOwners } from "@/lib/flagon-api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await ctx.params;
  try {
    const page = await listProjectOwners(slug, project, listOptionsFrom(request));
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
  const type = body.type === "user" || body.type === "team" ? body.type : "";
  const login = typeof body.login === "string" ? body.login.trim() : "";
  if (!type) {
    return badRequest("An owner type is required.");
  }
  if (!login) {
    return badRequest("A user or team is required.");
  }
  try {
    await addProjectOwner(slug, project, type, login);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not add owner.");
  }
}
