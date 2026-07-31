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
  /** Inline response body schema. Omit for empty/no-content responses. */
  schema?: z.ZodType;
  /**
   * Reference a reusable component schema by name (registered via
   * registerComponentSchema). Preferred over `schema` for resource bodies so the
   * document stays DRY and viewers can link to a single definition.
   */
  schemaName?: string;
  /** An example response body, shown inline by API viewers. */
  example?: unknown;
};

export type RouteSpec = {
  method: Method;
  /** Full path, OpenAPI style, e.g. "/v1/waitlist" or "/v1/orgs/{org}/flags". */
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  /**
   * Requires a Bearer access token (or session cookie). Adds the `bearerAuth`
   * security requirement to the operation. Defaults to false (public route).
   */
  auth?: boolean;
  /**
   * Which credential the operation takes. "bearer" (access token, the default
   * when `auth` is true) authenticates the management API; "sdkKey" is the
   * environment-scoped SDK key used by OFREP evaluation.
   */
  security?: "bearer" | "sdkKey";
  /**
   * Human descriptions for path parameters, keyed by name. The parameters
   * themselves are DERIVED from the `{...}` placeholders in `path`, so they can
   * never drift from the route; this only supplies nicer text.
   */
  paramDescriptions?: Record<string, string>;
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

/**
 * Reusable component schemas, emitted under components.schemas and referenced by
 * $ref, so a resource shape is defined once and linked everywhere it appears.
 */
const componentSchemas = new Map<string, z.ZodType>();
export function registerComponentSchema<T extends z.ZodType>(
  name: string,
  schema: T,
): T {
  componentSchemas.set(name, schema);
  return schema;
}

// The one error envelope every failure shares (see lib/http.ts). Registered up
// front so every 4xx/5xx response can reference it without repeating the shape.
registerComponentSchema(
  "Error",
  z.object({
    message: z.string().describe("A human-readable explanation of the failure."),
    status: z.number().int().describe("The HTTP status code, repeated in the body."),
    errors: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe("Per-field validation messages, present only on a 422."),
  }),
);

type SecurityName = "bearerAuth" | "clientKeyAuth";

const SECURITY_SCHEMES: Record<SecurityName, Record<string, unknown>> = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    description:
      "A Flagon access token (`flagon_oat_...`) for the management API. Send it as `Authorization: Bearer <token>`.",
  },
  clientKeyAuth: {
    type: "http",
    scheme: "bearer",
    description:
      "A Flagon client key (`flagon_client_...`), scoped to one environment, for OFREP evaluation. Send it as `Authorization: Bearer <key>`.",
  },
};

// Tag order and descriptions, so a viewer groups the surface sensibly. Tags a
// route uses but that are absent here still render, appended without a blurb.
const TAG_DEFS: { name: string; description: string }[] = [
  {
    name: "OFREP evaluation",
    description:
      "Evaluate flags with a client key over the OpenFeature Remote Evaluation Protocol (single and bulk).",
  },
  { name: "Flags", description: "Create and configure flags and their per-environment state." },
  { name: "Variants", description: "The values a flag can serve." },
  {
    name: "Targeting rules",
    description: "Per-environment rules that serve a variant to a matched audience.",
  },
  { name: "Segments", description: "Reusable, named audiences referenced by targeting rules." },
  { name: "Entities", description: "Known targeting subjects and their attributes." },
  { name: "Environments", description: "The stages a flag is configured across." },
  { name: "Client keys", description: "Per-environment publishable keys that authenticate OFREP evaluation." },
  { name: "Usage", description: "Org-wide metered usage, priced for the console usage page." },
  { name: "Projects", description: "The service catalog: projects and their ownership + metadata." },
  { name: "Teams", description: "Groups of people that own projects, with their own membership and roles." },
  { name: "Members", description: "People in an organization." },
  { name: "Account", description: "The authenticated caller." },
  { name: "Waitlist", description: "Public early-access intake." },
  { name: "Health", description: "Liveness and readiness probes." },
];

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

const API_DESCRIPTION = `The Flagon control plane. Everything the product does that needs to be live is an endpoint here; the console and marketing site render screens and call this API.

## Authentication

Two credentials, never interchangeable:

- **Access token** (\`flagon_oat_...\`) authenticates the **management API** under \`/v1\`. Send it as \`Authorization: Bearer <token>\`.
- **SDK key** (\`flagon_sdk_...\`), scoped to one environment, authenticates **OFREP evaluation** under \`/ofrep\`.

## Conventions

Every response is JSON, success and failure alike. A failure carries the \`Error\` envelope (a \`message\`, the \`status\`, and, on a 422, a per-field \`errors\` map). Management writes are rate limited; a \`429\` returns \`Retry-After\` and \`RateLimit-*\` headers.`;

/** zod -> JSON Schema (2020-12, which OpenAPI 3.1 embeds directly). */
function toSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  // `$schema` is meaningless once embedded inside an OpenAPI components block.
  delete json.$schema;
  return json;
}

/**
 * z.toJSONSchema emits recursive or reused subschemas into a LOCAL `$defs` block
 * with `#/$defs/...` refs (our targeting Predicate is recursive: an `all`/`any`
 * group contains more predicates). Inlined into an operation those refs resolve
 * from the document root and dangle. So hoist each schema's `$defs` into the
 * shared components pool under collision-free names and rewrite the refs to
 * point there, leaving a self-contained, resolvable document.
 */
function hoistDefs(
  schema: Record<string, unknown>,
  pool: Record<string, unknown>,
  nextName: () => string,
): Record<string, unknown> {
  const defs = schema.$defs as Record<string, unknown> | undefined;
  const rename: Record<string, string> = {};
  if (defs) for (const local of Object.keys(defs)) rename[local] = nextName();

  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "$ref" && typeof v === "string" && v.startsWith("#/$defs/")) {
          const local = v.slice("#/$defs/".length);
          out[k] = rename[local] ? `#/components/schemas/${rename[local]}` : v;
        } else {
          out[k] = rewrite(v);
        }
      }
      return out;
    }
    return node;
  };

  if (defs) {
    for (const [local, global] of Object.entries(rename)) {
      pool[global] = rewrite(defs[local]);
    }
  }
  const { $defs: _drop, ...rest } = schema;
  void _drop;
  return rewrite(rest) as Record<string, unknown>;
}

/** Extract the ordered `{name}` path parameters from an OpenAPI-style path. */
function pathParams(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => m[1]!);
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
  const usedTags = new Set<string>();
  const usedSecurity = new Set<SecurityName>();

  // Shared pool for hoisted recursive/reused subschemas, plus a counter for the
  // collision-free names they get. Merged into components.schemas at the end.
  const hoisted: Record<string, unknown> = {};
  let defSeq = 0;
  const materialize = (zt: z.ZodType, io: "input" | "output") =>
    hoistDefs(toSchema(zt, io), hoisted, () => `Def${defSeq++}`);

  for (const route of routes) {
    const operation: Record<string, unknown> = { summary: route.summary };
    if (route.description) operation.description = route.description;
    if (route.tags) {
      operation.tags = route.tags;
      for (const tag of route.tags) usedTags.add(tag);
    }

    // Path parameters are derived from the path so they can't drift from it.
    const params = pathParams(route.path);
    if (params.length) {
      operation.parameters = params.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
        ...(route.paramDescriptions?.[name]
          ? { description: route.paramDescriptions[name] }
          : {}),
      }));
    }

    const scheme: SecurityName | undefined =
      route.security === "sdkKey"
        ? "clientKeyAuth"
        : route.security === "bearer" || route.auth
          ? "bearerAuth"
          : undefined;
    if (scheme) {
      usedSecurity.add(scheme);
      operation.security = [{ [scheme]: [] }];
    }

    if (route.request?.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: materialize(route.request.body, "input") },
        },
      };
    }

    const responses: Record<string, unknown> = {};
    for (const [status, response] of Object.entries(route.responses)) {
      if (!response) continue;
      const statusNum = Number(status);
      // Prefer a named component ref, then an inline schema, then fall back to
      // the shared Error envelope for any failure status left unspecified.
      let schema: Record<string, unknown> | undefined;
      if (response.schemaName) schema = schemaRef(response.schemaName);
      else if (response.schema) schema = materialize(response.schema, "output");
      else if (statusNum >= 400) schema = schemaRef("Error");

      responses[status] = {
        description: response.description,
        ...(schema
          ? {
              content: {
                "application/json": {
                  schema,
                  ...(response.example !== undefined
                    ? { example: response.example }
                    : {}),
                },
              },
            }
          : {}),
      };
    }
    operation.responses = responses;

    (paths[route.path] ??= {})[route.method] = operation;
  }

  // Emit tags in the defined order, then any used-but-undefined tag after.
  const tags = [
    ...TAG_DEFS.filter((t) => usedTags.has(t.name)),
    ...[...usedTags]
      .filter((n) => !TAG_DEFS.some((t) => t.name === n))
      .map((name) => ({ name })),
  ];

  const schemas: Record<string, unknown> = {};
  for (const [name, zt] of componentSchemas) schemas[name] = materialize(zt, "output");
  // Fold in the subschemas hoisted out of recursive/reused request+response bodies.
  Object.assign(schemas, hoisted);

  const securitySchemes: Record<string, unknown> = {};
  for (const name of usedSecurity) securitySchemes[name] = SECURITY_SCHEMES[name];

  return {
    openapi: "3.1.0",
    info: {
      title: `${META.name} API`,
      version: META.version,
      description: API_DESCRIPTION,
      contact: { name: "Flagon", url: "https://flagon.io" },
    },
    externalDocs: {
      description: "Guides, concepts, and quickstarts",
      url: "https://flagon.io/docs",
    },
    servers: [{ url: baseUrl, description: "This deployment" }],
    tags,
    paths,
    components: {
      schemas,
      ...(Object.keys(securitySchemes).length ? { securitySchemes } : {}),
    },
  };
}
