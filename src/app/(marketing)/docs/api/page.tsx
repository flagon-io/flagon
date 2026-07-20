import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { apiHref } from "@/lib/urls";
import { OperationBlock, apiBase, operationsByTag, spec } from "./reference";
import { HashOpener } from "./hash-opener";

export const metadata: Metadata = {
  title: "API reference",
  description: `Browse the ${brand.name} REST API: endpoints, schemas, examples, and an interactive console. OpenAPI-compatible.`,
};

/**
 * Human-browsable API reference, rendered straight from the OpenAPI document
 * (src/lib/openapi.ts) so it can never drift from the served contract. The
 * docs shell (../layout.tsx) provides the sidebar; operations deep-link by
 * operationId.
 */
export default function ApiDocsPage() {
  const byTag = operationsByTag();

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        API reference
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        {spec.info.title}
      </h1>
      <div className="mt-4 space-y-3">
        {(spec.info.description ?? "")
          .split("\n")
          .filter(Boolean)
          .map((paragraph) => (
            <p key={paragraph} className="text-sm leading-6 text-zinc-400">
              {paragraph}
            </p>
          ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md border border-white/10 bg-white/2 px-3 py-1.5">
          <span className="text-zinc-500">Base URL: </span>
          <code className="text-teal-300">{apiBase}</code>
        </span>
        <a
          href={apiHref("/v1/openapi.json")}
          className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 font-medium text-teal-300 transition hover:bg-teal-500/15"
        >
          openapi.json
        </a>
      </div>

      {/* Operations: collapsed accordion rows grouped by tag; expanding a
          row reveals the full documentation and console inline. */}
      <div className="mt-10 space-y-8">
        {[...byTag.entries()].map(([tag, ops]) => {
          if (!ops.length) return null;
          const tagInfo = spec.tags.find((t) => t.name === tag);
          return (
            <section key={tag}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                {tag}
              </div>
              {tagInfo?.description ? (
                <p className="mt-1.5 text-xs leading-5 text-zinc-500">
                  {tagInfo.description}
                </p>
              ) : null}
              <div className="mt-3 space-y-1.5">
                {ops.map(({ path, method, op }) => (
                  <OperationBlock
                    key={op.operationId}
                    path={path}
                    method={method}
                    op={op}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <HashOpener />
    </div>
  );
}
