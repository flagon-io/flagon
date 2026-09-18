import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resendUserEmailOtp } from "@/lib/user-emails";
import { sendOtpEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await request.json();
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  try {
    const otp = await resendUserEmailOtp(session.user.id, email);
    await sendOtpEmail(email, otp, "email-verification");
    return NextResponse.json({ status: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
