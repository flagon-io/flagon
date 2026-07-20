import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/user-emails";

/**
 * GET /api/verify-email?token=... -> the landing endpoint for emailed
 * verification links. Browser-only flow (like /api/auth/*), deliberately NOT
 * part of the versioned public API. Consumes the single-use token and bounces
 * to the email settings page with a status flag. No session required: the
 * token IS the proof, and the recipient may open the link anywhere.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  const destination = new URL("/app/settings/emails", request.url);
  if (!token) {
    destination.searchParams.set("email_error", "invalid");
  } else {
    const result = await verifyEmailToken(token);
    if (result.ok) destination.searchParams.set("email_verified", "1");
    else
      destination.searchParams.set(
        "email_error",
        result.error === "expired" ? "expired" : "invalid",
      );
  }
  return NextResponse.redirect(destination);
}
