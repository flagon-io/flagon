"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { userEmails } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { emailExists, setPrimaryEmail } from "@/lib/user-emails";
import { createEmailSender } from "@/lib/email/sender";
import { changeEmailTemplate } from "@/lib/email/templates";
import { signToken } from "@/lib/token";
import { APP_URL } from "@/lib/urls";

/**
 * Server actions for the GitHub-style email manager. Adding an address stores it
 * unverified and emails a signed confirmation link; only verified addresses can
 * be made primary or used to sign in.
 */

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const VERIFY_TTL = 24 * 60 * 60 * 1000; // 24h

type Result = { error?: string; ok?: string };

export async function addEmailAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  if (await emailExists(email)) {
    // Do not reveal whether it belongs to someone else; if it is already yours
    // this is effectively a resend.
    if (email === user.email) return { error: "That is already your email." };
  } else {
    await db.insert(userEmails).values({
      userId: user.id,
      email,
      verified: false,
      isPrimary: false,
    });
  }

  await sendEmailVerification(user.id, email);
  revalidatePath("/settings/emails");
  return { ok: `Confirmation link sent to ${email}.` };
}

export async function resendEmailVerificationAction(
  formData: FormData,
): Promise<Result> {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "").toLowerCase();
  const rows = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, user.id), eq(userEmails.email, email)))
    .limit(1);
  if (!rows[0]) return { error: "That email is not on your account." };
  if (rows[0].verified) return { error: "That email is already verified." };
  await sendEmailVerification(user.id, email);
  return { ok: `Confirmation link resent to ${email}.` };
}

export async function setPrimaryEmailAction(
  formData: FormData,
): Promise<Result> {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "").toLowerCase();
  try {
    await setPrimaryEmail(user.id, email);
    revalidatePath("/settings/emails");
    return { ok: `${email} is now your primary email.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeEmailAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "").toLowerCase();
  const rows = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, user.id), eq(userEmails.email, email)))
    .limit(1);
  const row = rows[0];
  if (!row) return { error: "That email is not on your account." };
  if (row.isPrimary)
    return { error: "You cannot remove your primary email. Set another first." };

  await db.delete(userEmails).where(eq(userEmails.id, row.id));
  revalidatePath("/settings/emails");
  return { ok: `${email} removed.` };
}

async function sendEmailVerification(userId: string, email: string) {
  const token = signToken({ kind: "add-email", userId, email }, VERIFY_TTL);
  const url = `${APP_URL}/settings/emails/verify?token=${encodeURIComponent(token)}`;
  const { subject, html } = changeEmailTemplate(url);
  await createEmailSender().send({ to: email, subject, html });
}
