import { NextResponse } from "next/server";
import { updateOrg } from "@/lib/flagon-api";

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  try {
    const org = await updateOrg(slug, name);
    return NextResponse.json(org);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update the organization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
