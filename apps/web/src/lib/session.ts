import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { APP_URL } from "./urls";

/**
 * Login awareness for the marketing site.
 *
 * The console (app.flagon.io) owns auth; the marketing site does not run
 * BetterAuth. But it can still tell whether the visitor is signed in: the session
 * cookie is shared across surfaces (scoped to `.flagon.io` in production, and to
 * `localhost` across ports in dev), so we forward the incoming cookie to the
 * console's /api/auth/get-session and trust its answer. Wrapped in `cache()` so a
 * single render resolves it once.
 *
 * This makes the marketing pages render dynamically (they read the cookie),
 * which is fine: the header is personalized.
 */
export type MarketingUser = {
  name: string;
  email: string;
  username: string | null;
} | null;

export const getMarketingSession = cache(async (): Promise<MarketingUser> => {
  const cookie = (await headers()).get("cookie");
  // The session cookie uses a CUSTOM prefix ("flagon", see the console's
  // auth.ts advanced.cookiePrefix), so match the stable session-cookie base name
  // rather than BetterAuth's default "better-auth" (prefix-independent, and it
  // survives the "__Secure-" variant used in production).
  if (!cookie || !cookie.includes("session_token")) return null;

  try {
    const res = await fetch(`${APP_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: { name: string; email: string; username?: string | null };
    } | null;
    if (!data?.user) return null;
    return {
      name: data.user.name,
      email: data.user.email,
      username: data.user.username ?? null,
    };
  } catch {
    return null;
  }
});
