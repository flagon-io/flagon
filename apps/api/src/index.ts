import { Hono } from "hono";
import { logger } from "hono/logger";
import { openCors } from "./lib/cors.js";
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

app.route("/v1", v1);

// Everything this API returns is JSON, failures included: a client parses an
// error exactly the way it parses a success.
app.notFound((c) => jsonError(c, 404, "Not Found"));

app.onError((err, c) => {
  console.error(err);
  return jsonError(c, 500, "Server Error");
});

export default app;
