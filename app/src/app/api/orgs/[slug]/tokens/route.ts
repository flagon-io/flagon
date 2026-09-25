import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { createOAT, listOATs, type CreateTokenBody } from "@/lib/flagon-api";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const tokens = await listOATs(slug);
    return NextResponse.json({ tokens });
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const raw = await request.json().catch(() => ({}));
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("A name is required.");

  const body: CreateTokenBody = { name, role: typeof raw.role === "string" ? raw.role : "member" };
  if (raw.full === true) body.full = true;
  else if (Array.isArray(raw.scopes)) body.scopes = raw.scopes.filter((s: unknown) => typeof s === "string");
  if (typeof raw.expires_at === "string" && raw.expires_at) body.expires_at = raw.expires_at;
  else body.expires_in_days = Number(raw.expires_in_days) || 0;

  try {
    const created = await createOAT(slug, body);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not create token.");
  }
}
