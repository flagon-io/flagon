import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mirror the tsconfig `@/*` → `./src/*` path alias so tests can import modules by
 * their app alias (e.g. `@/server/ofrep/handler`), not just relative paths.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
