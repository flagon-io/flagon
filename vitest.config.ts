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
    alias: {
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
});
