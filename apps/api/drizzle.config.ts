import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config, used for `db:generate` (diff schema -> SQL) and
 * `db:studio`. Migrations are APPLIED by src/db/migrate.ts, not by drizzle-kit,
 * so they run through the owner connection and our own guard logic.
 *
 * `generate` needs no database, so an empty url is fine there; `studio`
 * connects as the owner. Env is loaded by the npm scripts (--env-file-if-exists)
 * or by the platform.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? "",
  },
});
