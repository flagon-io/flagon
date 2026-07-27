import { cors } from "hono/cors";

/**
 * CORS for a token-authenticated control plane that ALSO accepts the Flagon
 * session cookie from its sibling surfaces.
 *
 * Token auth travels in the `Authorization` header, which browsers never attach
 * automatically, so the API stays open to any origin for that path: there is
 * nothing a hostile origin can ride on. The one exception is the cookie path
 * ("browse the API while signed in"), which IS credentialed and therefore must
 * name specific origins: the console and marketing site. For those trusted
 * origins we echo the origin and allow credentials; every other origin gets a
 * plain wildcard (fine for header-token requests, and browsers correctly refuse
 * to send cookies to a wildcard origin).
 */
const trusted = new Set(
  [
    process.env.APP_URL ?? "http://localhost:3001",
    process.env.WEB_URL ?? "http://localhost:3000",
  ].filter(Boolean),
);

export const openCors = cors({
  origin: (origin) => (origin && trusted.has(origin) ? origin : "*"),
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
});
