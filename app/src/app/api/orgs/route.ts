import { NextResponse } from "next/server";
import { createOrg } from "@/lib/flagon-api";

// Thin proxy: the browser posts here, and the server-side gateway forwards to
// the Go API with the internal token + verified user identity.
export async function POST(request: Request) {
  let name = "";
  let slug: string | undefined;
  try {
    const body = await request.json();
    name = typeof body.name === "string" ? body.name : "";
    slug = typeof body.slug === "string" && body.slug ? body.slug : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!name.trim()) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }

  try {
    const org = await createOrg(name.trim(), slug);
    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create organization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
