import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userEmails } from "@/db/schema";
import { verifyToken } from "@/lib/token";

/**
 * Confirms a secondary email from the signed link sent when it was added. The
 * token is proof in itself (it carries the user + address and is HMAC-signed),
 * so this just flips the address to verified and returns to the email manager.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const data = token
    ? verifyToken<{ kind: string; userId: string; email: string }>(token)
    : null;

  if (!data || data.kind !== "add-email") {
    return NextResponse.redirect(
      new URL("/settings/emails?error=invalid", request.url),
    );
  }

  await db
    .update(userEmails)
    .set({ verified: true })
    .where(
      and(
        eq(userEmails.userId, data.userId),
        eq(userEmails.email, data.email),
      ),
    );

  return NextResponse.redirect(
    new URL("/settings/emails?verified=1", request.url),
  );
}
