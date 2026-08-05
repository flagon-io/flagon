import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * One root Vitest project for the whole monorepo. The first tests are the
 * security-critical PURE primitives — token hashing and our signed-token
 * HMAC — which need no database, so CI runs them with zero infra.
 *
 * `server-only` is a build-time marker whose default export throws when
 * imported outside a React Server Component. Under a plain Node test run it has
 * no meaning, so we alias it to the package's own empty module (the same file
 * the `react-server` condition resolves to) and let the modules under test
 * import it harmlessly.
 */
export default defineConfig({
  resolve: {
    // Array form so we can use a REGEX for the console's `@/` path alias — it
    // matches only `@/...` (never a scoped package like `@flagon/design`), letting
    // apps/app's DB-backed tests exercise modules that import via `@/`. Only
    // apps/app uses `@/` (apps/api/design do not), so this is collision-free.
    alias: [
      {
        find: "server-only",
        replacement: fileURLToPath(
          new URL("./node_modules/server-only/empty.js", import.meta.url),
        ),
      },
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./apps/app/src/", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // The DB-backed integration suites (OFREP routes, usage, management) all share
    // ONE local Postgres and each stand up ephemeral HTTP servers; running their
    // files in parallel contends on connections and starves teardown hooks (the
    // OpenFeature SDK e2e afterAll timed out at 10s). Serial file execution makes
    // the whole suite deterministic without callers needing --no-file-parallelism.
    // The pure unit tests are fast enough that the cost is negligible.
    fileParallelism: false,
    // Give DB setup/teardown (seed via withOrg, server.close, OpenFeature.close)
    // headroom so a slow local Postgres can't flake a hook.
    hookTimeout: 20_000,
  },
});
