import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { badRequest, routeError } from "@/lib/route-error";
import { resendUserEmailOtp } from "@/lib/user-emails";
import { sendOtpEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await request.json();
  if (typeof email !== "string" || !email.includes("@")) {
    return badRequest("A valid email is required.");
  }

  try {
    const otp = await resendUserEmailOtp(session.user.id, email);
    await sendOtpEmail(email, otp, "email-verification");
    return NextResponse.json({ status: true });
  } catch (e) {
    return routeError(e, "Something went wrong.");
  }
}
