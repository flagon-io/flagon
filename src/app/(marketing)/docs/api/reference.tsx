import { ChevronRight } from "lucide-react";
import { openApiSpec } from "@/lib/openapi";
import { CopyButton, TryIt } from "./try-it";

/**
 * Server-rendered OpenAPI reference. Renders the live spec object directly
 * (the same one served at /api/v1/openapi.json), so the docs page can never
 * drift from the contract.
 *
 * Each operation is a native <details> accordion: a one-line row (method,
 * path, summary) collapsed by default, expanding to the full documentation -
 * prose and parameters on the left, a sticky example rail on the right, and
 * the interactive console. Deep links auto-expand via HashOpener.
 *
 * The walker below is intentionally scoped to what our spec uses: object
 * schemas one level deep with $refs into components.schemas.
 */

/* ------------------------------ spec access ------------------------------ */

type Schema = {
  type?: string;
  format?: string;
  nullable?: boolean;
  description?: string;
  example?: unknown;
  required?: readonly string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: readonly Schema[];
  $ref?: string;
};

type Operation = {
  operationId: string;
  tags?: readonly string[];
  summary?: string;
  description?: string;
  security?: readonly unknown[];
  parameters?: readonly {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: Schema;
  }[];
  requestBody?: {
    content?: { "application/json"?: { schema?: Schema } };
  };
  responses: Record<
    string,
    {
      description?: string;
      headers?: Record<string, { description?: string; schema?: Schema }>;
      content?: {
        "application/json"?: { schema?: Schema; example?: unknown };
      };
    }
  >;
};

type LooseSpec = {
  info: { title: string; version: string; description?: string };
  servers: readonly { url: string; description?: string }[];
  tags: readonly { name: string; description?: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes?: Record<string, { description?: string }>;
    schemas: Record<string, Schema>;
  };
};

export const spec = openApiSpec as unknown as LooseSpec;

/** Display base for examples: the configured API origin, or local dev. */
export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

function resolve(schema: Schema | undefined): Schema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    return spec.components.schemas[name] ?? schema;
  }
  return schema;
}

function refName(schema: Schema | undefined): string | null {
  return schema?.$ref ? (schema.$ref.split("/").pop() ?? null) : null;
}

function typeLabel(schema: Schema | undefined): string {
  const s = resolve(schema);
  if (!s) return "unknown";
  if (s.type === "array") return `${typeLabel(s.items)}[]`;
  const base = s.format ? `${s.type} (${s.format})` : (s.type ?? "object");
  return s.nullable ? `${base} | null` : base;
}

/** Build an example JSON value from a schema (examples win over synthesis). */
function exampleOf(schema: Schema | undefined): unknown {
  const s = resolve(schema);
  if (!s) return null;
  if (s.example !== undefined) return s.example;
  if (s.allOf) {
    return Object.assign(
      {},
      ...s.allOf.map((part) => exampleOf(part) as object),
    ) as Record<string, unknown>;
  }
  if (s.type === "array") return [exampleOf(s.items)];
  if (s.type === "object" || s.properties) {
    const out: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(s.properties ?? {})) {
      out[key] = exampleOf(prop);
    }
    return out;
  }
  if (s.type === "boolean") return true;
  if (s.type === "integer" || s.type === "number") return 0;
  if (s.format === "date-time") return "2026-01-01T00:00:00.000Z";
  if (s.format === "email") return "user@flagon.io";
  return "string";
}

export function operationsByTag(): Map<
  string,
  { path: string; method: string; op: Operation }[]
> {
  const byTag = new Map<
    string,
    { path: string; method: string; op: Operation }[]
  >();
  for (const tag of spec.tags) byTag.set(tag.name, []);
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] ?? "Other";
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({ path, method, op });
    }
  }
  return byTag;
}

/* ------------------------------- components ------------------------------ */

const methodTones: Record<string, string> = {
  get: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  post: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  patch: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  put: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  delete: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-block w-16 rounded-md border px-0 py-0.5 text-center text-[11px] font-bold uppercase tracking-wide ${
        methodTones[method] ?? "bg-white/5 text-zinc-300 border-white/10"
      }`}
    >
      {method}
    </span>
  );
}

function statusTone(status: string): string {
  if (status.startsWith("2")) return "text-teal-300";
  if (status.startsWith("3")) return "text-sky-300";
  return "text-red-300";
}

function CodeBlock({
  children,
  label,
  copyText,
}: {
  children: string;
  label?: string;
  copyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
      {label ? (
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </span>
          {copyText ? <CopyButton text={copyText} /> : null}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 text-xs leading-5 text-zinc-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function FieldTable({
  schema,
  caption,
}: {
  schema: Schema | undefined;
  caption: string;
}) {
  const s = resolve(schema);
  const props = Object.entries(s?.properties ?? {});
  if (props.length === 0) return null;
  return (
    <div>
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {caption}
      </h5>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-white/5">
            {props.map(([name, prop]) => {
              const required = s?.required?.includes(name);
              const nested = refName(prop);
              const description = resolve(prop)?.description;
              return (
                <tr key={name}>
                  <td className="w-44 px-3 py-2.5 align-top">
                    <code className="text-[13px] text-zinc-100">{name}</code>
                    {required ? (
                      <span className="ml-1.5 text-[10px] font-medium uppercase text-amber-400/80">
                        required
                      </span>
                    ) : null}
                    <div className="mt-0.5 text-xs text-teal-300/80">
                      {nested ?? typeLabel(prop)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs leading-5 text-zinc-400">
                    {description ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function curlFor(path: string, method: string, op: Operation): string {
  const lines = [`curl ${apiBase}${path.replace(/\{(\w+)\}/g, "<$1>")}`];
  if (method !== "get") lines.push(`  -X ${method.toUpperCase()}`);
  if (op.security?.length) {
    // Token-first: Bearer is the canonical scheme (see spec securitySchemes).
    lines.push(`  -H "Authorization: Bearer <token>"`);
  }
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(exampleOf(bodySchema))}'`);
  }
  return lines.join(" \\\n");
}

function successExample(
  op: Operation,
): { status: string; body: string } | null {
  for (const [status, res] of Object.entries(op.responses)) {
    if (!status.startsWith("2")) continue;
    const media = res.content?.["application/json"];
    if (!media) return { status, body: "(no content)" };
    const example =
      media.example !== undefined ? media.example : exampleOf(media.schema);
    return { status, body: JSON.stringify(example, null, 2) };
  }
  return null;
}

export function OperationBlock({
  path,
  method,
  op,
}: {
  path: string;
  method: string;
  op: Operation;
}) {
  const requestSchema = op.requestBody?.content?.["application/json"]?.schema;
  const curl = curlFor(path, method, op);
  const success = successExample(op);
  const bodyExample = requestSchema
    ? JSON.stringify(exampleOf(requestSchema), null, 2)
    : null;

  return (
    <details
      id={op.operationId}
      className="group scroll-mt-24 rounded-lg border border-white/10 bg-white/2 transition open:border-white/15 open:bg-white/3"
    >
      <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-open:rotate-90"
          aria-hidden
        />
        <MethodBadge method={method} />
        <code className="text-sm font-medium text-zinc-100">{path}</code>
        {op.security?.length ? (
          <span
            title="Requires authentication"
            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500"
          >
            Auth
          </span>
        ) : null}
        <span className="ml-auto hidden truncate pl-4 text-xs text-zinc-500 sm:block">
          {op.summary}
        </span>
      </summary>

      <div className="border-t border-white/5 px-5 pb-5 pt-4">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Prose, parameters, responses */}
          <div className="min-w-0 space-y-5">
            {op.description ? (
              <p className="text-sm leading-6 text-zinc-400">
                {op.description}
              </p>
            ) : null}

            {op.parameters?.length ? (
              <div>
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Parameters
                </h5>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-white/5">
                      {op.parameters.map((p) => (
                        <tr key={`${p.in}-${p.name}`}>
                          <td className="w-44 px-3 py-2.5 align-top">
                            <code className="text-[13px] text-zinc-100">
                              {p.name}
                            </code>
                            {p.required ? (
                              <span className="ml-1.5 text-[10px] font-medium uppercase text-amber-400/80">
                                required
                              </span>
                            ) : null}
                            <div className="mt-0.5 text-xs text-teal-300/80">
                              {typeLabel(p.schema)} · {p.in}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-xs leading-5 text-zinc-400">
                            {p.description ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <FieldTable schema={requestSchema} caption="Request body" />

            <div>
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Responses
              </h5>
              <div className="space-y-3">
                {Object.entries(op.responses).map(([status, res]) => (
                  <div
                    key={status}
                    className="rounded-lg border border-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-baseline gap-2 text-sm">
                      <code className={`font-semibold ${statusTone(status)}`}>
                        {status}
                      </code>
                      <span className="text-xs text-zinc-400">
                        {res.description}
                      </span>
                    </div>
                    {res.headers
                      ? Object.entries(res.headers).map(([name, header]) => (
                          <p
                            key={name}
                            className="mt-1.5 text-xs leading-5 text-zinc-500"
                          >
                            <code className="text-zinc-300">{name}</code>
                            {header.description ? (
                              <> - {header.description}</>
                            ) : null}
                          </p>
                        ))
                      : null}
                    {!status.startsWith("2") &&
                    res.content?.["application/json"] ? (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-black/40 p-2.5 text-xs leading-5 text-zinc-400">
                        <code>
                          {JSON.stringify(
                            res.content["application/json"].example ??
                              exampleOf(res.content["application/json"].schema),
                            null,
                            2,
                          )}
                        </code>
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Example rail */}
          <div className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
            <CodeBlock label="Example request" copyText={curl}>
              {curl}
            </CodeBlock>
            {success ? (
              <CodeBlock label={`Response · ${success.status}`}>
                {success.body}
              </CodeBlock>
            ) : null}
          </div>
        </div>

        <TryIt
          method={method}
          path={path}
          requiresAuth={Boolean(op.security?.length)}
          params={(op.parameters ?? []).map((p) => ({
            name: p.name,
            in: p.in,
            required: p.required,
          }))}
          bodyExample={bodyExample}
        />
      </div>
    </details>
  );
}
