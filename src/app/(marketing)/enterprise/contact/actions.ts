"use server";

import { headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { uuidv7 } from "@/lib/uuidv7";

/**
 * Contact-sales lead capture. Writes to the leads table (drizzle/0010);
 * follow-up happens in internal tooling, deliberately not email.
 */
export type LeadResult = { ok: boolean; message: string };

const SUBMISSIONS_PER_IP_PER_HOUR = 3;

export async function submitLead(input: {
  name: string;
  email: string;
  company: string;
  companySize?: string;
  message?: string;
  source?: string;
}): Promise<LeadResult> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const company = input.company?.trim() ?? "";

  if (!name || !company) {
    return { ok: false, message: "Name and company are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid work email." };
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
    kind: "enterprise",
    name,
    email,
    company,
    companySize: input.companySize?.trim() || null,
    message: input.message?.trim().slice(0, 4000) || null,
    source: input.source?.trim() || null,
    ip,
  });

  return {
    ok: true,
    message: "Thanks! Our team will reach out shortly.",
  };
}
