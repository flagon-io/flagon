import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "hono/logger";
import { brandMarkSvg } from "./lib/brand-mark.js";
import { openCors } from "./lib/cors.js";
import { healthBody } from "./lib/health.js";
import { baseUrl, jsonError } from "./lib/http.js";
import { buildOpenApiDocument, buildRootIndex } from "./openapi/registry.js";
import { v1 } from "./routes/v1/index.js";

// The API is the control plane: everything that matters (today: the waitlist;
// soon: projects, flags, auth) lives behind /v1/* and both Next.js apps talk
// to it over plain HTTP — they render screens, the API owns the data.
//
// Importing ./routes/v1 also runs each route module, which is what populates
// the OpenAPI registry that GET / and GET /openapi.json read.
const app = new Hono();

app.use("*", logger());
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

app.route("/v1", v1);

// Everything this API returns is JSON, failures included: a client parses an
// error exactly the way it parses a success.
app.notFound((c) => jsonError(c, 404, "Not Found"));

app.onError((err, c) => {
  console.error(err);
  return jsonError(c, 500, "Server Error");
});

export default app;
