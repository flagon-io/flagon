import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { deleteOrg, updateOrg } from "@/lib/flagon-api";

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("A name is required.");
  try {
    const org = await updateOrg(slug, name);
    return NextResponse.json(org);
  } catch (e) {
    return routeError(e, "Could not update the organization.");
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const org = await deleteOrg(slug);
    return NextResponse.json(org);
  } catch (e) {
    return routeError(e, "Could not delete the organization.");
  }
}
