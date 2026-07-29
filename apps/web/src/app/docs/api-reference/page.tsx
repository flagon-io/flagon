import { API_URL } from "@/lib/api";

/**
 * The API Reference: rendered from the live OpenAPI 3.1 document the API serves
 * at /openapi.json, so it can never drift from the real routes. Fetched at build
 * time and revalidated hourly; if the API is unreachable the page degrades to a
 * pointer at the raw spec rather than failing the build.
 */
export const revalidate = 3600;

export const metadata = {
  title: "API Reference",
  description:
    "The Flagon REST API: every management endpoint and OFREP evaluation, generated from the live OpenAPI 3.1 document.",
};

// --- Minimal OpenAPI shape (only what we render) -----------------------------

type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
};
type MediaType = { schema?: JsonSchema; example?: unknown };
type Content = Record<string, MediaType>;
type Param = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
};
type Operation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Param[];
  security?: Record<string, unknown>[];
  requestBody?: { required?: boolean; content?: Content };
  responses?: Record<string, { description?: string; content?: Content }>;
};
const METHODS = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];
type PathItem = Partial<Record<Method, Operation>>;
type OpenApiDoc = {
  info?: { title?: string; version?: string };
  servers?: { url: string; description?: string }[];
  tags?: { name: string; description?: string }[];
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    securitySchemes?: Record<string, { description?: string }>;
  };
};

async function getSpec(): Promise<OpenApiDoc | null> {
  try {
    const res = await fetch(`${API_URL}/openapi.json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as OpenApiDoc;
  } catch {
    return null;
  }
}

// --- Schema helpers ----------------------------------------------------------

type Schemas = Record<string, JsonSchema>;

function deref(schema: JsonSchema, schemas: Schemas): { schema: JsonSchema; name?: string } {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    if (name && schemas[name]) return { schema: schemas[name], name };
  }
  return { schema };
}

function unwrapNullable(schema: JsonSchema): { schema: JsonSchema; nullable: boolean } {
  if (schema.anyOf) {
    const nonNull = schema.anyOf.filter((s) => s.type !== "null");
    const nullable = nonNull.length !== schema.anyOf.length;
    if (nonNull.length === 1) return { schema: nonNull[0]!, nullable };
    return { schema: { ...schema, anyOf: nonNull }, nullable };
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const rest = schema.type.filter((t) => t !== "null");
    return { schema: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
  }
  return { schema, nullable: false };
}

function typeLabel(input: JsonSchema, schemas: Schemas): string {
  const { schema: d, name } = deref(input, schemas);
  const { schema } = unwrapNullable(d);
  if (name && (schema.type === "object" || schema.properties)) return name;
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.type === "array") return `${typeLabel(schema.items ?? {}, schemas)}[]`;
  const t = Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type;
  if (!t) return "any";
  return schema.format ? `${t} · ${schema.format}` : t;
}

// --- Rendering ---------------------------------------------------------------

const methodColor: Record<Method, string> = {
  get: "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  post: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  put: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  patch: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  delete: "bg-rose-400/15 text-rose-300 ring-rose-400/30",
};

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${methodColor[method]}`}
    >
      {method}
    </span>
  );
}

function SchemaTree({
  schema,
  schemas,
  depth = 0,
}: {
  schema: JsonSchema;
  schemas: Schemas;
  depth?: number;
}) {
  const { schema: d } = deref(schema, schemas);
  const { schema: s } = unwrapNullable(d);

  if (depth > 5) {
    return <span className="text-zinc-500">{typeLabel(schema, schemas)}</span>;
  }

  if (s.type === "array" && s.items) {
    return (
      <div>
        <div className="text-xs text-zinc-500">array of</div>
        <SchemaTree schema={s.items} schemas={schemas} depth={depth + 1} />
      </div>
    );
  }

  if (s.properties) {
    const required = new Set(s.required ?? []);
    return (
      <ul className="flex flex-col gap-1.5">
        {Object.entries(s.properties).map(([name, prop]) => {
          const { schema: pd } = deref(prop, schemas);
          const { schema: ps } = unwrapNullable(pd);
          const nested =
            (ps.properties && depth < 5) ||
            (ps.type === "array" && ps.items && (deref(ps.items, schemas).schema.properties || ps.items.$ref));
          return (
            <li key={name} className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <code className="font-mono text-[13px] text-teal-300">{name}</code>
                <span className="font-mono text-xs text-zinc-400">{typeLabel(prop, schemas)}</span>
                {required.has(name) ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/80">
                    required
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">optional</span>
                )}
              </div>
              {ps.description ? (
                <p className="mt-1 text-xs text-zinc-400">{ps.description}</p>
              ) : null}
              {nested ? (
                <div className="mt-2 border-l border-white/10 pl-3">
                  <SchemaTree schema={prop} schemas={schemas} depth={depth + 1} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="text-sm">
      <span className="font-mono text-xs text-zinc-400">{typeLabel(schema, schemas)}</span>
      {s.description ? <p className="mt-1 text-xs text-zinc-400">{s.description}</p> : null}
    </div>
  );
}

function jsonBody(content: Content | undefined): MediaType | undefined {
  return content?.["application/json"];
}

function securityLabel(op: Operation): string | null {
  const scheme = op.security?.[0] ? Object.keys(op.security[0]!)[0] : null;
  if (scheme === "clientKeyAuth") return "Client key";
  if (scheme === "bearerAuth") return "Access token";
  return null;
}

function OperationBlock({
  method,
  path,
  op,
  schemas,
}: {
  method: Method;
  path: string;
  op: Operation;
  schemas: Schemas;
}) {
  const auth = securityLabel(op);
  const reqBody = jsonBody(op.requestBody?.content);
  const responses = Object.entries(op.responses ?? {});

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={method} />
        <code className="break-all font-mono text-sm text-zinc-200">{path}</code>
        {auth ? (
          <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400 ring-1 ring-inset ring-white/10">
            Auth: {auth}
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500 ring-1 ring-inset ring-white/10">
            Public
          </span>
        )}
      </div>

      {op.summary ? <p className="mt-3 text-sm font-medium text-zinc-100">{op.summary}</p> : null}
      {op.description ? <p className="mt-1 text-sm text-zinc-400">{op.description}</p> : null}

      {op.parameters && op.parameters.length ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Path parameters</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {op.parameters.map((p) => (
              <li key={p.name} className="flex flex-wrap items-baseline gap-x-2">
                <code className="font-mono text-[13px] text-teal-300">{p.name}</code>
                <span className="font-mono text-xs text-zinc-500">
                  {p.schema ? typeLabel(p.schema, schemas) : "string"}
                </span>
                {p.description ? <span className="text-xs text-zinc-400">{p.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reqBody?.schema ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Request body</h4>
          <div className="mt-2">
            <SchemaTree schema={reqBody.schema} schemas={schemas} />
          </div>
        </div>
      ) : null}

      {responses.length ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Responses</h4>
          <div className="mt-2 flex flex-col gap-3">
            {responses.map(([status, res]) => {
              const body = jsonBody(res.content);
              const ok = status.startsWith("2");
              return (
                <div key={status}>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={
                        "font-mono text-xs font-semibold " +
                        (ok ? "text-emerald-300" : "text-zinc-400")
                      }
                    >
                      {status}
                    </span>
                    <span className="text-xs text-zinc-400">{res.description}</span>
                  </div>
                  {ok && body?.schema ? (
                    <div className="mt-2 border-l border-white/10 pl-3">
                      <SchemaTree schema={body.schema} schemas={schemas} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function ApiReferencePage() {
  const spec = await getSpec();
  const specUrl = `${API_URL}/openapi.json`;

  if (!spec?.paths) {
    return (
      <div className="not-prose">
        <h1 className="text-2xl font-semibold text-zinc-100">API Reference</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The live API document could not be loaded right now. It is always available as raw OpenAPI
          3.1 at{" "}
          <a href={specUrl} className="text-teal-300 underline">
            {specUrl}
          </a>
          , and the guides under Feature Flags cover evaluation and the management API in prose.
        </p>
      </div>
    );
  }

  const schemas = spec.components?.schemas ?? {};
  const baseUrl = spec.servers?.[0]?.url ?? API_URL;
  const schemeDescriptions = spec.components?.securitySchemes ?? {};

  // Group operations by tag, in the document's tag order, then any untagged.
  const tagOrder = (spec.tags ?? []).map((t) => t.name);
  const byTag = new Map<string, { method: Method; path: string; op: Operation }[]>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Other";
      const list = byTag.get(tag) ?? [];
      list.push({ method, path, op });
      byTag.set(tag, list);
    }
  }
  const orderedTags = [
    ...tagOrder.filter((t) => byTag.has(t)),
    ...[...byTag.keys()].filter((t) => !tagOrder.includes(t)),
  ];
  const tagDescription = new Map((spec.tags ?? []).map((t) => [t.name, t.description]));

  return (
    <div className="not-prose">
      <h1 className="text-2xl font-semibold text-zinc-100">API Reference</h1>
      <p className="mt-3 text-sm text-zinc-400">
        The complete Flagon REST API, generated from the live OpenAPI 3.1 document so it never drifts
        from the running service. Point any OpenAPI tool at the raw spec, or read it inline below.
      </p>

      <div className="mt-5 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Base URL</div>
          <code className="font-mono text-zinc-200">{baseUrl}</code>
        </div>
        <a
          href={specUrl}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-teal-400/10 px-3 py-1.5 text-sm font-medium text-teal-300 ring-1 ring-inset ring-teal-400/30 hover:bg-teal-400/15"
        >
          Download openapi.json
        </a>
      </div>

      {Object.keys(schemeDescriptions).length ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Authentication</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-400">
            {Object.entries(schemeDescriptions).map(([name, s]) => (
              <li key={name}>{s.description ?? name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col gap-12">
        {orderedTags.map((tag) => (
          <section key={tag}>
            <h2 className="text-lg font-semibold text-zinc-100">{tag}</h2>
            {tagDescription.get(tag) ? (
              <p className="mt-1 text-sm text-zinc-400">{tagDescription.get(tag)}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-4">
              {byTag.get(tag)!.map(({ method, path, op }) => (
                <OperationBlock
                  key={`${method}-${path}`}
                  method={method}
                  path={path}
                  op={op}
                  schemas={schemas}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
