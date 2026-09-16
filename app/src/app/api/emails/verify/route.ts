import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { verifyUserEmailOtp } from "@/lib/user-emails";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, otp } = await request.json();
  if (typeof email !== "string" || typeof otp !== "string") {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  try {
    await verifyUserEmailOtp(session.user.id, email, otp);
    return NextResponse.json({ status: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
