import { NextResponse } from "next/server";
import { otpEmail } from "@/emails/otp";

// Dev-only email preview. Open /api/dev/email?context=sign-in in a browser to
// eyeball templates. Never available in production.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const context = new URL(request.url).searchParams.get("context") ?? "email-verification";
  // Preview the click-to-verify button for the verification email.
  const verifyUrl =
    context === "email-verification"
      ? "http://localhost:3000/verify-email?email=you@example.com&otp=063481"
      : undefined;
  const { html } = otpEmail({ code: "063481", context, verifyUrl });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
