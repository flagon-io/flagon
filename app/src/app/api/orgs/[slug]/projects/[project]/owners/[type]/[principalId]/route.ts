import { NextResponse } from "next/server";
import { removeProjectOwner } from "@/lib/flagon-api";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; project: string; type: string; principalId: string }> },
) {
  const { slug, project, type, principalId } = await ctx.params;
  if (type !== "user" && type !== "team") {
    return NextResponse.json({ error: "Invalid owner type." }, { status: 400 });
  }
  try {
    await removeProjectOwner(slug, project, type, principalId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove owner.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
