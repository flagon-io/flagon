import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * ONE-TIME cutover for the migration squash (see drizzle/README.md).
 *
 * After the baseline (`0000_baseline.sql`, journal `when=1`) is deployed, production
 * still has ~47 rows in `drizzle.__drizzle_migrations` whose max `created_at` is the old
 * SYNTHETIC high-water mark (~1.79e12, ahead of real time). The runner applies any
 * migration whose `when` > that max, so a freshly-generated migration (real `Date.now()`)
 * would be silently SKIPPED. This resets the table to a single baseline marker at
 * `created_at=1`, so every future generated migration applies normally.
 *
 * SAFE: the baseline migration itself is never re-run (its `when=1` < any real DB's max),
 * so this only rewrites the bookkeeping table, never the schema. It prints the existing
 * rows first (recovery record) and runs in one transaction. Gated behind
 * `CONFIRM_REBASELINE=1`. Run AFTER the baseline is deployed and BEFORE the next forward
 * migration. Rollback: re-insert the printed rows.
 *
 * Usage: CONFIRM_REBASELINE=1 npm run db:rebaseline
 */
async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("[rebaseline] no connection string (MIGRATE_DATABASE_URL / DATABASE_URL_UNPOOLED / DATABASE_URL).");
    process.exit(1);
  }
  if (process.env.CONFIRM_REBASELINE !== "1") {
    console.error("[rebaseline] refusing to run without CONFIRM_REBASELINE=1. This rewrites drizzle.__drizzle_migrations (bookkeeping only, not the schema).");
    process.exit(1);
  }

  const baselinePath = fileURLToPath(new URL("../drizzle/0000_baseline.sql", import.meta.url));
  const baselineHash = createHash("sha256").update(readFileSync(baselinePath, "utf8")).digest("hex");

  const sql = postgres(url, { max: 1 });
  try {
    const existing = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    console.log(`[rebaseline] current __drizzle_migrations rows (${existing.length}) — SAVE THIS for rollback:`);
    console.log(JSON.stringify(existing, null, 2));

    if (existing.length === 1 && String(existing[0].created_at) === "1") {
      console.log("[rebaseline] already reset (one row at created_at=1). Nothing to do.");
      return;
    }

    await sql.begin(async (tx) => {
      await tx`DELETE FROM drizzle.__drizzle_migrations`;
      await tx`INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES (${baselineHash}, 1)`;
    });

    const after = await sql`SELECT count(*)::int AS n, max(created_at) AS mx FROM drizzle.__drizzle_migrations`;
    const { n, mx } = after[0] as { n: number; mx: string };
    if (n !== 1 || String(mx) !== "1") {
      throw new Error(`[rebaseline] verification failed: expected 1 row at created_at=1, got n=${n} max=${mx}`);
    }
    console.log("[rebaseline] done. High-water mark reset to 1; future generated migrations will apply.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[rebaseline] failed:", err);
  process.exit(1);
});
