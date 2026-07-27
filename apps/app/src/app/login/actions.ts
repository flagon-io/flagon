"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolvePrimaryEmail } from "@/lib/user-emails";

/**
 * Sign in from the console, server-side.
 *
 * Running this on the server (rather than the browser client) is what lets a
 * user authenticate with ANY of their verified emails: an entered address is
 * resolved to the account's primary before the password check, without exposing
 * an address-lookup endpoint an attacker could enumerate. Usernames go straight
 * to the username sign-in. On success the session cookie is set by the
 * nextCookies plugin; the client then navigates.
 */
export async function signInAction(input: {
  identifier: string;
  password: string;
}): Promise<{ error?: string }> {
  const identifier = input.identifier.trim();
  const { password } = input;
  const requestHeaders = await headers();

  try {
    if (identifier.includes("@")) {
      const email = await resolvePrimaryEmail(identifier);
      await auth.api.signInEmail({ body: { email, password }, headers: requestHeaders });
    } else {
      await auth.api.signInUsername({
        body: { username: identifier, password },
        headers: requestHeaders,
      });
    }
    return {};
  } catch (error) {
    const message =
      (error as { body?: { message?: string } })?.body?.message ??
      (error as { message?: string })?.message;
    return {
      error:
        message ?? "We could not sign you in. Check your details and try again.",
    };
  }
}
