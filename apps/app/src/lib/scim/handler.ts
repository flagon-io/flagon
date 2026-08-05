import "server-only";
import { authenticateScimRequest } from "./token";
import { scimError } from "./resource";
import { ScimBadRequest, ScimConflict, ScimForbidden } from "./provision";
import { APP_URL } from "@/lib/urls";

/**
 * Wrap a SCIM route handler with bearer authentication, brute-force throttling,
 * a body-size cap, and a single error->status mapping. Resolves the org from the
 * presented SCIM token (or 401s) and hands the handler the org id + base URL.
 */

// The largest SCIM request body we accept (defensive cap; SCIM users/groups are
// small). Rejected before parsing so an oversized payload can't exhaust memory.
const MAX_BODY_BYTES = 256 * 1024;

// In-memory failed-auth throttle, keyed by client IP — apps/app has no shared
// limiter, so this mirrors the API's `auth-fail` backstop (20 misses / 5 min).
// Per-instance on purpose (a DoS/brute-force backstop, not the primary guard);
// valid tokens never touch it.
const AUTH_FAIL_LIMIT = 20;
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000;
const authFails = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Record a failed auth for an IP; returns true if it is now over the limit. */
function noteAuthFailure(ip: string, now: number): boolean {
  const hit = authFails.get(ip);
  if (!hit || hit.resetAt <= now) {
    authFails.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW_MS });
    return false;
  }
  hit.count += 1;
  return hit.count > AUTH_FAIL_LIMIT;
}

export function withScim(
  handler: (ctx: {
    organizationId: string;
    baseUrl: string;
    req: Request;
  }) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    const now = Date.now();
    const ip = clientIp(req);

    // Throttle a source already over the failed-auth limit before any DB work.
    const existing = authFails.get(ip);
    if (existing && existing.resetAt > now && existing.count > AUTH_FAIL_LIMIT) {
      return scimError(429, "Too many failed authentication attempts. Try again later.");
    }

    // Reject oversized bodies up front (writes only carry a body).
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return scimError(413, "Request body is too large.");
    }

    const auth = await authenticateScimRequest(req);
    if (!auth) {
      if (noteAuthFailure(ip, now)) {
        return scimError(429, "Too many failed authentication attempts. Try again later.");
      }
      return scimError(401, "A valid SCIM bearer token is required.");
    }

    try {
      return await handler({
        organizationId: auth.organizationId,
        baseUrl: APP_URL,
        req,
      });
    } catch (err) {
      // Deliberately-thrown SCIM errors carry a safe message; anything else is
      // an internal fault whose detail (raw DB text, etc.) must NOT reach the IdP.
      if (err instanceof ScimConflict) return scimError(409, err.message, "uniqueness");
      if (err instanceof ScimBadRequest) return scimError(400, err.message, "invalidValue");
      if (err instanceof ScimForbidden) return scimError(403, err.message, "mutability");
      console.error("[scim] unexpected error", err);
      return scimError(500, "Unexpected SCIM error.");
    }
  };
}

/**
 * Parse a SCIM `userName eq "value"` filter. Returns the value string, or `null`
 * when no filter was sent, or the sentinel `UNPARSEABLE` when a filter is present
 * but not one we support (so the caller can 400 rather than silently list all).
 */
export const UNPARSEABLE_FILTER = Symbol("unparseable-filter");
export function parseUserNameFilter(
  url: string,
): string | null | typeof UNPARSEABLE_FILTER {
  const filter = new URL(url).searchParams.get("filter");
  if (!filter) return null;
  const match = filter.match(/userName\s+eq\s+"([^"]+)"/i);
  return match ? match[1]! : UNPARSEABLE_FILTER;
}

/** A v4/v7 UUID, used to 404 non-UUID resource ids instead of hitting Postgres. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Best-effort JSON body parse; returns {} on empty/invalid bodies. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
