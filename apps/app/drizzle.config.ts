import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for the console's auth schema, used by `db:generate`
 * (diff schema -> SQL). Migrations are APPLIED by src/db/migrate.ts (owner
 * connection, its own `drizzle_auth` tracking schema), not by drizzle-kit.
 *
 * Note: the initial 0000_auth migration was authored by hand, so no snapshot
 * exists yet. The first `db:generate` after a schema change will create one and
 * diff from it; regenerate carefully if you have already applied 0000.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: { schema: "drizzle_auth" },
  dbCredentials: {
    url: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? "",
  },
});
