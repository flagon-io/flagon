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

/**
 * Thrown when we CANNOT determine the session because the auth API is
 * unreachable (network error, timeout, or 5xx) after retries. This is a real
 * error, NOT a sign-out: a transient blip or cold start must never masquerade as
 * "you're logged out". Protected pages let this bubble to the error boundary
 * (see app/error.tsx), which tells the user their session is safe and offers a
 * retry, instead of silently dumping them at /login.
 */
export class SessionUnavailableError extends Error {
  constructor() {
    super("Flagon's authentication service is temporarily unreachable.");
    this.name = "SessionUnavailableError";
  }
}

// Retry budget for reaching the auth API. Timeout is per-attempt (so a cold
// start that hangs is aborted and retried against a warm instance); backoff is
// the pause BEFORE each attempt. Kept under a typical 10s function budget.
const AUTH_TIMEOUT_MS = 2800;
const AUTH_BACKOFF_MS = [0, 250, 600];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch from the API with the forwarded cookie, RETRYING transient failures
 * (network error, timeout, 5xx) with short backoff so a momentary hiccup does
 * not look like a hard failure. Returns the Response, or null if every attempt
 * failed to get a usable answer (caller decides whether that is fatal).
 */
async function authFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const cookie = (await headers()).get("cookie") ?? "";
  for (let attempt = 0; attempt < AUTH_BACKOFF_MS.length; attempt++) {
    if (AUTH_BACKOFF_MS[attempt]) await sleep(AUTH_BACKOFF_MS[attempt]!);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { cookie, ...(init?.headers ?? {}) },
        cache: "no-store",
        signal: controller.signal,
      });
      // 5xx: the service is up but erroring — worth another try until we run out.
      if (res.status >= 500 && attempt < AUTH_BACKOFF_MS.length - 1) continue;
      return res;
    } catch {
      // Network error / timeout / abort — fall through to the next attempt.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * The current session for the incoming request, or null when signed out. Reads
 * the API's get-session with the forwarded cookie. This is the seam the whole
 * console gates on (pages, layouts, server actions).
 */
export const getSession = cache(async (): Promise<SessionResult> => {
  // No session cookie at all = definitely signed out. Never hit the API for this
  // (and never throw): a signed-out visitor with the API down should still land
  // cleanly on /login, not on an error screen.
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie.includes("session_token")) return null;

  // We HAVE a session cookie, so the answer is authoritative only if the API
  // actually answered. If it did, trust it (a valid session, or a real sign-out
  // when the row is gone/expired -> null). If it did NOT (unreachable after
  // retries, or a 5xx), that is an ERROR, not a logout -> throw so the caller
  // surfaces it instead of signing the user out on a blip.
  const res = await authFetch("/api/auth/get-session");
  if (!res || !res.ok) throw new SessionUnavailableError();
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
