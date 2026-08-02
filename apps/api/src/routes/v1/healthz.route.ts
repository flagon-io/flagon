import { Hono } from "hono";
import { z } from "zod";
import { healthBody } from "../../lib/health.js";
import { registerRoute } from "../../openapi/registry.js";

const healthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  time: z.string().describe("ISO-8601 server time."),
});

registerRoute({
  method: "get",
  path: "/v1/healthz",
  summary: "Health check",
  description:
    "Liveness probe. Returns the current server time; never touches the database.",
  tags: ["Health"],
  responses: {
    200: { description: "The service is up.", schema: healthResponse },
  },
});

export const healthz = new Hono();

healthz.get("/", (c) => c.json(healthBody({ version: "v1" })));
