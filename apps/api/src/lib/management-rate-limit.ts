import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";
import { rateLimit, tooManyRequests } from "./rate-limit.js";
import { callerFingerprint, isMutating } from "./request-fingerprint.js";

/**
 * Throttle authenticated management MUTATIONS on the /v1/orgs/:org/* surface.
 *
 * The eval hot path has its own limiter; this protects the *write* side. Each
 * management write is a withOrg() transaction plus a flag_revision append plus
 * an eval-cache invalidation, so an unbounded write flood from a valid token or
 * session is the expensive abuse case. This caps it per (org, caller) per
 * window.
 *
 * It runs BEFORE the per-router auth work (the same way the waitlist limiter
 * runs before parsing), so a flood is turned away before it costs a transaction
 * or a database round-trip for auth. Reads pass straight through: the console is
 * read-heavy and reads are cheap, and the concern here is the write path.
 *
 * Like rateLimit() itself, it FAILS OPEN on any error.
 */
export const managementWriteLimit: MiddlewareHandler = async (c, next) => {
  if (!isMutating(c.req.method)) return next();

  const org = c.req.param("org") ?? "unknown";
  const result = await rateLimit({
    key: `mgmt-write:${org}:${callerFingerprint(c)}`,
    limit: env.MGMT_WRITE_RATE_LIMIT,
    windowSeconds: env.MGMT_WRITE_WINDOW_SECONDS,
  });
  if (!result.ok) return tooManyRequests(c, result);

  return next();
};
