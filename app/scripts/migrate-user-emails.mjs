// Applies db/migrations/*.sql in order. Separate from `npx @better-auth/cli
// migrate`, which only manages BetterAuth's own core tables.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const dir = join(import.meta.dirname, "..", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const file of files) {
      console.log(`applying ${file}...`);
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query(sql);
    }
    console.log("done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
