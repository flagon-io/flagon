// Minimal, transparent SQL migrator. Applies drizzle/*.sql in filename order,
// each in its own transaction, tracked in schema_migrations. Runs as the OWNER
// (DATABASE_URL_OWNER), which has DDL rights, not as the restricted app role.
//
// - Skips gracefully (exit 0) when no owner URL is configured, so Vercel preview
//   builds without a database don't fail.
// - Holds a Postgres advisory lock so concurrent deploys serialize safely.
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { resolveOwnerUrl } from "./db-urls.mjs";

config({ path: [".env.local", ".env"] });

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "drizzle");

const url = resolveOwnerUrl();
if (!url) {
  console.log("No owner database URL set; skipping migrations.");
  process.exit(0);
}

const sql = postgres(url, { max: 1 });

try {
  // Serialize concurrent migrators (e.g. overlapping deploys).
  await sql`SELECT pg_advisory_lock(hashtext('flagon_schema_migrations'))`;

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  for (const file of files) {
    const [{ exists }] = await sql`
      SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = ${file}) AS exists
    `;
    if (exists) {
      console.log(`  skip    ${file}`);
      continue;
    }
    const contents = await readFile(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`  applied ${file}`);
    applied += 1;
  }

  console.log(applied ? `\nApplied ${applied} migration(s).` : "\nUp to date.");
} finally {
  await sql`SELECT pg_advisory_unlock(hashtext('flagon_schema_migrations'))`.catch(
    () => {},
  );
  await sql.end();
}
