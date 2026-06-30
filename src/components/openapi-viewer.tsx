'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/skeleton';

type Spec = any;

const METHOD_STYLES: Record<string, string> = {
  get: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  post: 'bg-brand-500/10 text-brand-500 border-brand-500/20',
  patch: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  put: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  delete: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function resolveRef(spec: Spec, schema: any): any {
  if (schema && schema.$ref) {
    const name = String(schema.$ref).split('/').pop()!;
    return { __name: name, ...(spec.components?.schemas?.[name] ?? {}) };
  }
  return schema;
}

function typeLabel(spec: Spec, schema: any): string {
  if (!schema) return 'any';
  const r = resolveRef(spec, schema);
  if (r.__name && schema.$ref) return r.__name;
  if (r.enum) return r.enum.map((e: unknown) => JSON.stringify(e)).join(' | ');
  if (r.type === 'array') return `${typeLabel(spec, r.items)}[]`;
  if (r.type) return r.format ? `${r.type}<${r.format}>` : r.type;
  return 'any';
}

function SchemaProps({ spec, schema }: { spec: Spec; schema: any }) {
  const r = resolveRef(spec, schema);
  if (!r || r.type !== 'object' || !r.properties) {
    return <p className="text-xs text-muted">{typeLabel(spec, schema)}</p>;
  }
  const required: string[] = r.required ?? [];
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(r.properties).map(([name, prop]: [string, any]) => (
            <tr key={name} className="border-b border-border last:border-0">
              <td className="px-3 py-2 align-top font-mono text-foreground">
                {name}
                {required.includes(name) && <span className="ml-1 text-brand-500">*</span>}
              </td>
              <td className="px-3 py-2 align-top font-mono text-muted">{typeLabel(spec, prop)}</td>
              <td className="px-3 py-2 align-top text-muted">{prop.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Operation({ spec, path, method, op }: { spec: Spec; path: string; method: string; op: any }) {
  const [open, setOpen] = useState(false);
  const body = op.requestBody?.content?.['application/json']?.schema;
  const responses: [string, any][] = Object.entries(op.responses ?? {});
  const params = [...(op.parameters ?? [])].map((p: any) =>
    p.$ref ? spec.components?.parameters?.[String(p.$ref).split('/').pop()!] : p,
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`w-16 shrink-0 rounded border px-2 py-0.5 text-center font-mono text-[11px] uppercase ${METHOD_STYLES[method]}`}
        >
          {method}
        </span>
        <span className="font-mono text-sm text-foreground">{path}</span>
        <span className="ml-auto hidden text-sm text-muted sm:block">{op.summary}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-4">
          {op.description && <p className="text-sm text-muted">{op.description}</p>}
          {op.security && (
            <p className="text-xs text-muted">
              Auth:{' '}
              <span className="font-mono text-foreground">
                {op.security.map((s: any) => Object.keys(s)[0]).join(', ')}
              </span>
            </p>
          )}

          {params.length > 0 && (
            <div>
              <h4 className="eyebrow mb-2">Parameters</h4>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <tbody>
                    {params.map((p: any) => (
                      <tr key={p.name} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-foreground">{p.name}</td>
                        <td className="px-3 py-2 font-mono text-muted">in: {p.in}</td>
                        <td className="px-3 py-2 text-muted">{p.description ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {body && (
            <div>
              <h4 className="eyebrow mb-2">Request body</h4>
              <SchemaProps spec={spec} schema={body} />
            </div>
          )}

          <div>
            <h4 className="eyebrow mb-2">Responses</h4>
            <div className="space-y-3">
              {responses.map(([status, res]) => {
                const schema = res.content?.['application/json']?.schema;
                return (
                  <div key={status}>
                    <p className="mb-1 text-sm">
                      <span className="font-mono text-foreground">{status}</span>{' '}
                      <span className="text-muted">{res.description}</span>
                    </p>
                    {schema && <SchemaProps spec={spec} schema={schema} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OpenApiViewer() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/openapi.json')
      .then((r) => r.json())
      .then(setSpec)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-muted">Could not load the API spec.</p>;
  if (!spec) {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const tags: { name: string; description?: string }[] = spec.tags ?? [];
  const byTag = new Map<string, { path: string; method: string; op: any }[]>();
  for (const [path, item] of Object.entries<any>(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method]) {
        const tag = item[method].tags?.[0] ?? 'Other';
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push({ path, method, op: item[method] });
      }
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {spec.info?.title}{' '}
            <span className="font-mono text-sm text-muted">v{spec.info?.version}</span>
          </h2>
          <p className="mt-1 font-mono text-xs text-muted">{spec.servers?.[0]?.url}</p>
        </div>
        <a
          href="/api/openapi.json"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          openapi.json ↗
        </a>
      </div>

      <div className="mt-8 space-y-10">
        {tags.map((tag) => {
          const ops = byTag.get(tag.name);
          if (!ops?.length) return null;
          return (
            <section key={tag.name}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{tag.name}</h3>
              {tag.description && <p className="mt-1 text-sm text-muted">{tag.description}</p>}
              <div className="mt-3 space-y-2">
                {ops.map((o) => (
                  <Operation key={`${o.method}-${o.path}`} spec={spec} {...o} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
