import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { badRequest, routeError } from "@/lib/route-error";
import { verifyUserEmailOtp } from "@/lib/user-emails";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, otp } = await request.json();
  if (typeof email !== "string" || typeof otp !== "string") {
    return badRequest("Email and code are required.");
  }

  try {
    await verifyUserEmailOtp(session.user.id, email, otp);
    return NextResponse.json({ status: true });
  } catch (e) {
    return routeError(e, "Something went wrong.");
  }
}
