import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { API_URL } from "@/lib/urls";

/**
 * Server-side auth helpers for the console.
 *
 * Auth is OWNED by the API now (BetterAuth is hosted there — see
 * apps/api/src/lib/auth.ts, mounted at /api/auth/*). The console is a pure
 * client: it forwards the request cookie to the API's session endpoints. There
 * is no BetterAuth instance here anymore; the browser uses `@/lib/auth-client`
 * (which points at the API), and these server helpers read the session over HTTP.
 */

/** The session shape the API's /api/auth/get-session returns (dates are ISO strings over HTTP). */
export type SessionResult = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    username?: string | null;
    displayUsername?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: string;
    activeOrganizationId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
} | null;

async function authFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie.includes("session_token")) return null;
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { cookie, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

/**
 * The current session for the incoming request, or null when signed out. Reads
 * the API's get-session with the forwarded cookie. This is the seam the whole
 * console gates on (pages, layouts, server actions).
 */
export const getSession = cache(async (): Promise<SessionResult> => {
  const res = await authFetch("/api/auth/get-session");
  if (!res || !res.ok) return null;
  const data = (await res.json()) as SessionResult;
  return data && data.user ? data : null;
});

/**
 * The current user, or throw. For server actions behind the auth gate, where a
 * missing session is unexpected (the proxy already keeps signed-out visitors out).
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  return session.user;
}

/** Device sessions for the current user (security page). Empty on any failure. */
export async function getSessions(): Promise<
  {
    token: string;
    createdAt: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }[]
> {
  const res = await authFetch("/api/auth/list-sessions");
  if (!res || !res.ok) return [];
  try {
    const data = (await res.json()) as
      | { token: string; createdAt: string; userAgent?: string | null; ipAddress?: string | null }[]
      | null;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
