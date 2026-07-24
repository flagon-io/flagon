"use server";

import { headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { uuidv7 } from "@/lib/uuidv7";

/**
 * Enterprise "coming soon" waitlist capture. Writes to the leads table
 * (drizzle/0010) with kind "waitlist"; follow-up happens in the operator
 * console, deliberately not email.
 */
export type WaitlistResult = { ok: boolean; message: string };

const SUBMISSIONS_PER_IP_PER_HOUR = 3;

export async function joinWaitlist(input: {
  email: string;
  company?: string;
  source?: string;
}): Promise<WaitlistResult> {
  const email = input.email?.trim().toLowerCase() ?? "";
  const company = input.company?.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email." };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Public unauthenticated write: keep a lid on per-IP volume.
  if (ip) {
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          eq(leads.ip, ip),
          gte(leads.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if (recent >= SUBMISSIONS_PER_IP_PER_HOUR) {
      return {
        ok: false,
        message: "Too many submissions. Please try again later.",
      };
    }
  }

  await db.insert(leads).values({
    id: uuidv7(),
    kind: "waitlist",
    // The leads table requires a name/company; the waitlist only asks for an
    // email, so we fall back to it rather than add columns for a coming-soon list.
    name: email,
    email,
    company: company ?? "",
    source: input.source?.trim() || null,
    ip,
  });

  return {
    ok: true,
    message: "You're on the list. We'll be in touch when Enterprise is ready.",
  };
}
