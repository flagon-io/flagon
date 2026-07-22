import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import { openApiSpec } from "./openapi";

/**
 * Structural guarantees for the API contract: unique operationIds, resolvable
 * $refs, and complete operations. Catches the easy ways the document rots.
 */
type Loose = Record<string, unknown>;

function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

const spec = openApiSpec as unknown as {
  openapi: string;
  info: Loose;
  paths: Record<string, Record<string, Loose>>;
  components: { schemas: Record<string, unknown> };
};

describe("OpenAPI document", () => {
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ path, method, op })),
  );

  it("declares OpenAPI 3 with info", () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
  });

  it("gives every operation a unique operationId, tag, summary, and responses", () => {
    const ids = new Set<string>();
    for (const { path, method, op } of operations) {
      const label = `${method.toUpperCase()} ${path}`;
      expect(op.operationId, label).toBeTruthy();
      expect(
        ids.has(op.operationId as string),
        `duplicate id at ${label}`,
      ).toBe(false);
      ids.add(op.operationId as string);
      expect((op.tags as string[])?.length, label).toBeGreaterThan(0);
      expect(op.summary, label).toBeTruthy();
      expect(Object.keys(op.responses as Loose).length, label).toBeGreaterThan(
        0,
      );
    }
    expect(operations.length).toBeGreaterThanOrEqual(5);
  });

  it("resolves every $ref into components.schemas", () => {
    for (const ref of collectRefs(spec.paths)) {
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const name = ref.split("/").pop() as string;
      expect(spec.components.schemas[name], ref).toBeDefined();
    }
  });

  it("stays in lockstep with the route files on disk (API-first parity)", () => {
    // Auto-documentation enforcement: a v1 route without a spec entry (or a
    // documented path with no route file) fails this test. See AGENTS.md.
    const apiRoot = join(__dirname, "..", "app", "api");
    const routeFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.ts") routeFiles.push(full);
      }
    };
    walk(apiRoot);

    const undocumented = [
      "", // /api index
      "/v1/openapi.json", // the contract itself
      "/auth/[...all]", // BetterAuth's surface (browser flows)
      "/verify-email", // emailed-link landing (browser flow)
      "/cron/cleanup", // scheduled maintenance (infra, CRON_SECRET-gated)
      "/cron/compact", // hourly usage compaction (infra, CRON_SECRET-gated)
      "/webhooks/stripe", // Stripe webhook (infra, signature-gated)
      "/ofrep/v1/exposures", // flag-usage ingest (infra, client-token-gated)
      "/[...catchall]", // JSON 404 fallback
    ];

    const routePaths = routeFiles
      .map((file) => {
        // Drop the trailing route.ts segment; the remainder is the URL path.
        const segments = relative(apiRoot, file).split(/[\\/]/).slice(0, -1);
        return "/" + segments.join("/");
      })
      .map((p) => (p === "/" ? "" : p))
      .filter((p) => !undocumented.includes(p))
      .map((p) => p.replace(/\[(\w+)\]/g, "{$1}"))
      .sort();

    const specPaths = Object.keys(spec.paths).sort();

    expect(routePaths).toEqual(specPaths);
  });

  it("documents the user surface, read-only for emails", () => {
    for (const path of ["/v1/user", "/v1/user/emails"]) {
      expect(spec.paths[path], path).toBeDefined();
    }
    // Email MANAGEMENT is deliberately app-only: no mutation
    // endpoints in the public contract.
    expect(Object.keys(spec.paths["/v1/user/emails"])).toEqual(["get"]);
    expect(spec.paths["/v1/user/emails/{id}"]).toBeUndefined();
  });
});
