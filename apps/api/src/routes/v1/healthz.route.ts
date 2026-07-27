import { Hono } from "hono";
import { z } from "zod";
import { META } from "../../meta.js";
import { registerRoute } from "../../openapi/registry.js";

const healthResponse = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  time: z.string().describe("ISO-8601 server time."),
});

registerRoute({
  method: "get",
  path: "/v1/healthz",
  summary: "Health check",
  description:
    "Liveness probe. Returns service identity and the current server time; never touches the database.",
  tags: ["Meta"],
  responses: {
    200: { description: "The service is up.", schema: healthResponse },
  },
});

export const healthz = new Hono();

healthz.get("/", (c) =>
  c.json({
    status: "ok",
    service: META.service,
    version: "v1",
    time: new Date().toISOString(),
  }),
);
