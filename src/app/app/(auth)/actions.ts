"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { resolveLoginEmail } from "@/lib/user-emails";

/**
 * Server actions for the auth forms. Sign-in goes through the server (rather
 * than authClient) so the identifier can be resolved against user_emails
 * first: any VERIFIED address a user owns signs them in, while
 * BetterAuth itself only knows the primary. The nextCookies plugin in
 * src/lib/auth.ts propagates the Set-Cookie from these calls.
 */
export type AuthActionResult = { ok: true } | { ok: false; error: string };

function friendlyAuthError(error: unknown): string {
  if (error instanceof APIError) {
    // Uniform message for any credential failure; don't leak which part was
    // wrong or which addresses exist.
    if ([400, 401, 403, 404, 422].includes(error.statusCode)) {
      return "Incorrect username or password.";
    }
    return error.body?.message ?? "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export async function signInAction(
  identifier: string,
  password: string,
): Promise<AuthActionResult> {
  const id = identifier.trim();
  const requestHeaders = await headers();

  try {
    if (id.includes("@")) {
      const email = await resolveLoginEmail(id);
      await auth.api.signInEmail({
        body: { email, password },
        headers: requestHeaders,
      });
    } else {
      await auth.api.signInUsername({
        body: { username: id, password },
        headers: requestHeaders,
      });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyAuthError(error) };
  }
}

export async function requestPasswordResetAction(
  email: string,
  redirectTo: string,
): Promise<AuthActionResult> {
  const requestHeaders = await headers();
  try {
    // Alternate addresses resolve to the account's primary, so the reset link
    // reaches the user no matter which of their emails they typed.
    const loginEmail = await resolveLoginEmail(email.trim());
    await auth.api.requestPasswordReset({
      body: { email: loginEmail, redirectTo },
      headers: requestHeaders,
    });
  } catch {
    // Swallow: the flow always reports success to avoid account enumeration.
  }
  return { ok: true };
}
