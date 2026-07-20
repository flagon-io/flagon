"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  addEmail,
  removeEmail,
  resendVerification,
  setPrimary,
} from "@/lib/user-emails";

/**
 * Email management happens through the app only (server actions): the public
 * REST API can READ your profile and emails but not manage account security
 * surfaces. Same lib helpers underneath either way.
 */
export type EmailActionResult = {
  ok: boolean;
  message: string;
  /** addEmailAction only: false when the verification send failed. */
  sent?: boolean;
};

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function addEmailAction(
  email: string,
): Promise<EmailActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, message: "Sign in required." };

  const result = await addEmail(userId, email);
  if (!result.ok) {
    const messages = {
      invalid: "That doesn't look like an email address.",
      taken: "That email address is already in use.",
      "unverified-primary":
        "Verify your primary email address before adding another email.",
    } as const;
    return { ok: false, message: messages[result.error] };
  }
  return { ok: true, message: "", sent: result.sent };
}

export async function removeEmailAction(
  emailId: string,
): Promise<EmailActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, message: "Sign in required." };
  const result = await removeEmail(userId, emailId);
  return result.ok
    ? { ok: true, message: "" }
    : { ok: false, message: result.error };
}

export async function setPrimaryEmailAction(
  emailId: string,
): Promise<EmailActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, message: "Sign in required." };
  const result = await setPrimary(userId, emailId);
  return result.ok
    ? { ok: true, message: "" }
    : { ok: false, message: result.error };
}

export async function resendVerificationAction(
  emailId: string,
): Promise<EmailActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, message: "Sign in required." };
  const result = await resendVerification(userId, emailId);
  return result.ok
    ? { ok: true, message: "" }
    : { ok: false, message: result.error };
}
