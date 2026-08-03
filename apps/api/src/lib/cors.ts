import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

/**
 * CORS for a token-authenticated control plane that ALSO accepts the Flagon
 * session cookie from its sibling surfaces.
 *
 * There are two distinct callers, and they need different CORS:
 *
 *   1. Header-token callers ("Authorization: Bearer …") from ANY origin. Browsers
 *      never attach the Authorization header automatically, so there is nothing
 *      a hostile origin can ride on. These get a plain wildcard and NO
 *      credentials — a wildcard is fine because the request carries no ambient
 *      authority, and withholding credentials means an untrusted origin can
 *      never read a cookie-authenticated response.
 *
 *   2. Cookie callers ("browse the API while signed in") from our OWN surfaces,
 *      the console and marketing site. This path IS credentialed, so it must
 *      name a specific origin and echo it with Access-Control-Allow-Credentials.
 *
 * The old single config returned "*" together with credentials:true, which is a
 * contradiction browsers ignore — and worse, it advertised credentialed access
 * to every origin. Splitting the two closes that: credentials are offered ONLY
 * to the trusted origins, and everyone else gets a credential-free wildcard.
 */
// Fall back to the NEXT_PUBLIC_* names too: those are set on every project for
// the Next apps, so honoring them here means the API trusts app./www. even when
// only the public vars are configured (a real prod footgun otherwise — the
// browser auth calls are credentialed and MUST get an echoed origin, not "*").
const trusted = new Set(
  [
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
    process.env.WEB_URL ?? process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000",
  ].filter(Boolean),
);

const shared = {
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // If-None-Match lets browser OFREP providers make conditional bulk-eval
  // requests; without it the cross-origin preflight rejects the header and the
  // 304 caching path is dead from the browser. Idempotency-Key lets browser
  // clients send exposures/goal events with exactly-once retry semantics; without
  // it the preflight for /ofrep/v1/exposures and /ofrep/v1/track is rejected.
  allowHeaders: ["Content-Type", "Authorization", "If-None-Match", "Idempotency-Key"],
  // ETag is required for the conditional-request/304 loop; Retry-After and the
  // RateLimit-* family let SDKs read throttling signals off a 429.
  exposeHeaders: [
    "Content-Length",
    "ETag",
    "Retry-After",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
  ],
  maxAge: 86400,
};

// Trusted, credentialed: echo the specific origin and allow cookies.
const credentialedCors = cors({
  ...shared,
  origin: (origin) => (origin && trusted.has(origin) ? origin : ""),
  credentials: true,
});

// Everyone else: wildcard, no credentials. Good for header-token requests;
// browsers correctly refuse to send cookies to a wildcard origin anyway.
const publicCors = cors({
  ...shared,
  origin: "*",
  credentials: false,
});

export const openCors: MiddlewareHandler = (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && trusted.has(origin)) return credentialedCors(c, next);
  return publicCors(c, next);
};
