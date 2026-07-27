import { z } from "zod";
import { META } from "../meta.js";

/**
 * A single source of truth for "what routes exist."
 *
 * Every route module calls registerRoute() at import time with its method,
 * path, and zod schemas. Two things are then GENERATED from that list at
 * request time, so neither can drift from the routes or from each other and
 * there is nothing to hand-maintain:
 *
 *   - the root index (GET /), a hypermedia map of `<name>_url` -> full URL,
 *     the way a well-behaved REST root advertises its own routes; and
 *   - the OpenAPI 3.1 document (GET /openapi.json), which docs tooling can
 *     render directly.
 *
 * Add a route -> register it -> it appears in both. The zod schemas double as
 * runtime validation and as the published contract.
 */

type Method = "get" | "post" | "put" | "patch" | "delete";

export type RouteResponse = {
  description: string;
  /** Response body schema. Omit for empty/no-content responses. */
  schema?: z.ZodType;
};

export type RouteSpec = {
  method: Method;
  /** Full path, OpenAPI style, e.g. "/v1/waitlist" or "/v1/orgs/{org}". */
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  request?: { body?: z.ZodType };
  responses: Partial<Record<number, RouteResponse>>;
};

const routes: RouteSpec[] = [];

export function registerRoute(spec: RouteSpec): RouteSpec {
  routes.push(spec);
  return spec;
}

export function listRoutes(): readonly RouteSpec[] {
  return routes;
}

/** zod -> JSON Schema (2020-12, which OpenAPI 3.1 embeds directly). */
function toSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  // `$schema` is meaningless once embedded inside an OpenAPI components block.
  delete json.$schema;
  return json;
}

/**
 * Derive the index key from a path: "/v1/user/emails" -> "user_emails_url".
 * Path params are dropped so the key stays stable, matching how a REST root
 * names its links.
 */
function indexKey(path: string): string {
  const slug = path
    .replace(/^\/v\d+\//, "")
    .replace(/\/\{[^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "_");
  return slug ? `${slug}_url` : "";
}

export function buildRootIndex(baseUrl: string): Record<string, string> {
  const index: Record<string, string> = {};
  for (const route of routes) {
    const key = indexKey(route.path);
    if (key) index[key] = `${baseUrl}${route.path}`;
  }
  // The spec is part of the surface too, so it's discoverable from the root.
  index.openapi_url = `${baseUrl}/openapi.json`;
  return index;
}

export function buildOpenApiDocument(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const operation: Record<string, unknown> = { summary: route.summary };
    if (route.description) operation.description = route.description;
    if (route.tags) operation.tags = route.tags;

    if (route.request?.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: toSchema(route.request.body, "input") },
        },
      };
    }

    const responses: Record<string, unknown> = {};
    for (const [status, response] of Object.entries(route.responses)) {
      if (!response) continue;
      responses[status] = {
        description: response.description,
        ...(response.schema
          ? {
              content: {
                "application/json": { schema: toSchema(response.schema, "output") },
              },
            }
          : {}),
      };
    }
    operation.responses = responses;

    (paths[route.path] ??= {})[route.method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${META.name} API`,
      version: META.version,
      description: META.description,
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
