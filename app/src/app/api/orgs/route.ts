import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
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
    return badRequest("Invalid request.");
  }

  if (!name.trim()) {
    return badRequest("Organization name is required.");
  }

  try {
    const org = await createOrg(name.trim(), slug);
    return NextResponse.json({ org }, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not create organization.");
  }
}
