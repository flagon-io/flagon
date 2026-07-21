import { NextResponse } from "next/server";

/**
 * API response helpers. House conventions, no reinvented wheels:
 *
 * - Success is the HTTP status code. GETs return the resource itself (bare
 *   object) or a bare array for collections - no {data}/{success} wrappers.
 * - Mutations return the updated resource (200/201) or nothing (204).
 * - Errors are a flat { message, code } body on a 4xx/5xx status.
 * - Metadata rides in headers (pagination via RFC 8288 Link when it lands).
 * - The API surface must NEVER return HTML, even for 404s.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiJson(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

/** 204: the mutation succeeded and there is nothing useful to return. */
export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { message, code, ...(details ?? {}) },
    { status, headers: NO_STORE },
  );
}

/**
 * CSRF guard for cookie-authenticated, state-changing endpoints (mirrors what
 * BetterAuth does for its own routes). Browsers always send Origin on
 * fetch/XHR mutations; a missing or foreign Origin is rejected.
 */
export function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const requestHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    if (originHost === requestHost) return true;
    const trusted = [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_MARKETING_URL,
      process.env.NEXT_PUBLIC_API_URL,
      process.env.BETTER_AUTH_URL,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new URL(value).host);
    return trusted.includes(originHost);
  } catch {
    return false;
  }
}

export const apiForbiddenOrigin = () =>
  apiError(403, "invalid_origin", "Missing or untrusted Origin header.");

export const apiNotFound = () =>
  apiError(404, "not_found", "The requested API endpoint does not exist.");

export const apiMethodNotAllowed = () =>
  apiError(
    405,
    "method_not_allowed",
    "This method is not allowed on this endpoint.",
  );
