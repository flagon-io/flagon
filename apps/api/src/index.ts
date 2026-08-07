// MUST be first: initialize Sentry before anything it auto-instruments loads.
import { sentryEnabled } from "./instrument.js";
// Validate the environment at boot: fail fast and loud on a misconfigured
// deploy rather than on the first request.
import "./env.js";
import * as Sentry from "@sentry/node";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { logger as httpLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db/client.js";
import { brandMarkPng, brandMarkSvg } from "./lib/brand-mark.js";
import { openCors } from "./lib/cors.js";
import { healthBody } from "./lib/health.js";
import { baseUrl, jsonError } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import { buildOpenApiDocument, buildRootIndex } from "./openapi/registry.js";
import { ofrep } from "./routes/ofrep/index.js";
import { v1 } from "./routes/v1/index.js";
import { stripeWebhook } from "./routes/webhooks/stripe.route.js";
import { internal } from "./routes/internal/cron.route.js";

// The API is the control plane: everything that matters (projects, flags,
// experiments, incidents, auth) lives behind /v1/* and both Next.js apps talk
// to it over plain HTTP — they render screens, the API owns the data.
//
// Importing ./routes/v1 also runs each route module, which is what populates
// the OpenAPI registry that GET / and GET /openapi.json read.
const app = new Hono();

app.use("*", httpLogger());
// Security headers on every response. The defaults are right for a JSON API:
// nosniff, frame denial, HSTS, referrer + cross-origin policies. Content-Security
// -Policy is deliberately left off (no default) — this API renders no HTML, so a
// CSP would only add risk without protecting anything.
app.use("*", secureHeaders());
app.use("*", openCors);

// Root index: a generated, self-maintaining hypermedia map of the registered
// routes (like a REST API advertising its own endpoints). Nothing to update
// here when routes change.
app.get("/", (c) => c.json(buildRootIndex(baseUrl(c))));

// The always-published OpenAPI 3.1 document, generated from the same registry.
app.get("/openapi.json", (c) => c.json(buildOpenApiDocument(baseUrl(c))));

// Top-level liveness probe, deliberately unversioned: load balancers and
// uptime checks want one stable URL that keeps meaning "is the service up"
// even after /v2 ships. The versioned /v{n}/healthz probes are part of each
// version's documented API contract; this one is operational, like GET /.
app.get("/healthz", (c) => c.json(healthBody()));

// Readiness probe: liveness answers "is the process up", this answers "can it
// actually serve", which for this API means the database is reachable. A deploy
// with a broken connection string is LIVE but not READY, and this is the one
// endpoint that tells them apart — so it deliberately runs a query. Bounded by a
// timeout so a hung database returns 503 promptly instead of hanging the probe.
app.get("/readyz", async (c) => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("readiness check timed out")), 5000),
  );
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return c.json({ status: "ready", time: new Date().toISOString() });
  } catch (err) {
    logger.error("readiness check failed", { err });
    return c.json({ status: "unready", time: new Date().toISOString() }, 503);
  }
});

// The API renders no HTML, but a browser opening it still asks for a favicon,
// and the root index is meant to be looked at. Serve the same Flagon mark the
// other surfaces use so the tab icon matches everywhere.
const serveBrandMark = (c: Context) =>
  c.body(brandMarkSvg, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
app.get("/favicon.ico", serveBrandMark);
app.get("/icon.svg", serveBrandMark);
app.get("/favicon.png", (c) =>
  c.body(brandMarkPng, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
  }),
);

app.route("/v1", v1);

// OFREP: the OpenFeature Remote Evaluation Protocol. The flag-evaluation hot
// path, authenticated by client key rather than the control-plane token/cookie.
app.route("/ofrep", ofrep);

// Stripe webhook: authenticated by request signature, not a token/cookie, so it
// sits outside /v1 and the management middleware. See the route for details.
app.route("/webhooks/stripe", stripeWebhook);

// Internal cron endpoints (metered-billing reporting sweep), authenticated by a
// shared CRON_SECRET bearer token that Vercel Cron injects. See the route.
app.route("/internal", internal);

// NOTE: authentication is NOT hosted here. The console (app.flagon.io) owns
// BetterAuth and mounts /api/auth/*; the API validates the session cookie it
// signs (see lib/auth-context.ts) and never runs BetterAuth itself.

// Everything this API returns is JSON, failures included: a client parses an
// error exactly the way it parses a success.
app.notFound((c) => jsonError(c, 404, "Not Found"));

app.onError(async (err, c) => {
  // One structured line to the logs, always. The response stays generic so no
  // internal detail (stack, SQL, env) ever reaches the client.
  logger.error("unhandled request error", {
    err,
    method: c.req.method,
    path: c.req.path,
  });
  if (sentryEnabled) {
    Sentry.captureException(err);
    // Serverless functions freeze the moment we return, so drain the queue
    // first (bounded so a slow Sentry never holds the response hostage).
    await Sentry.flush(2000);
  }
  return jsonError(c, 500, "Server Error");
});

export default app;
