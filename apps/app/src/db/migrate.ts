import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

/**
 * Apply the console's (auth) migrations, as the OWNER role.
 *
 * Mirrors apps/api/src/db/migrate.ts: DDL runs on the owner's DIRECT (unpooled)
 * connection, resolving `MIGRATE_DATABASE_URL` -> `DATABASE_URL_UNPOOLED` ->
 * `DATABASE_URL`, and skips (rather than fails) when no connection string is
 * configured so a first deploy without a database still goes green.
 *
 * The one difference: this pipeline tracks its applied migrations in a SEPARATE
 * schema (`drizzle_auth`) from the API's default (`drizzle`). Both apps migrate
 * the same database; without distinct tracking tables their journals would
 * interleave by timestamp and silently skip each other's migrations.
 */
async function main() {
  const url =
    process.env.MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[migrate:auth] no connection string (MIGRATE_DATABASE_URL / DATABASE_URL_UNPOOLED / DATABASE_URL); skipping. Add the database, then redeploy to apply migrations.",
    );
    return;
  }

  const sql = postgres(url, { max: 1 });
  try {
    const migrationsFolder = fileURLToPath(
      new URL("../../drizzle", import.meta.url),
    );
    await migrate(drizzle(sql), {
      migrationsFolder,
      migrationsSchema: "drizzle_auth",
    });
    console.log("[migrate:auth] up to date");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate:auth] failed:", err);
  process.exit(1);
});
