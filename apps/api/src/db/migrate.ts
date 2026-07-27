import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

/**
 * Apply pending migrations, as the OWNER role.
 *
 * DDL and drizzle's migration bookkeeping must run as the role that owns the
 * schema, not the RLS-restricted app role, so this uses the owner's DIRECT
 * (unpooled) connection: migrations take locks and run in a transaction, which
 * a connection pooler breaks. Resolution order: `MIGRATE_DATABASE_URL`, then
 * the unpooled owner string `DATABASE_URL_UNPOOLED`, then `DATABASE_URL` for
 * single-role local dev.
 *
 * Runs from `npm run db:migrate`: locally by hand, and in the deploy build step
 * so a release applies its migrations before it serves traffic. With no
 * connection string configured yet it skips rather than failing the build.
 */
async function main() {
  const url =
    process.env.MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL;
  if (!url) {
    // Skip rather than fail. This runs in the deploy build, and the project is
    // set up in stages: the database is often added AFTER the project exists,
    // so a first build with no DB yet should go green and simply migrate on
    // the next deploy once the connection string is present. A prod instance
    // that truly has no database still fails loudly at runtime (see client.ts).
    console.warn(
      "[migrate] no connection string (MIGRATE_DATABASE_URL / DATABASE_URL_UNPOOLED / DATABASE_URL); skipping. Add the database, then redeploy to apply migrations.",
    );
    return;
  }

  // A dedicated single-use connection: no pooling, closed as soon as we finish.
  const sql = postgres(url, { max: 1 });
  try {
    const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
    await migrate(drizzle(sql), { migrationsFolder });
    console.log("[migrate] up to date");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
