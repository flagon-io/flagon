/**
 * Migration runner (used by `pnpm db:migrate` and the Docker entrypoint).
 * Applies Drizzle migrations, then the idempotent RLS policy file so tenant
 * isolation is in place on every deploy.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

// Load .env for standalone CLI runs (Next loads it itself; containers set real env).
try {
  process.loadEnvFile();
} catch {
  /* no .env file - rely on the ambient environment */
}

async function main() {
  // Prefer a direct (non-pooled) connection for migrations. Accept the names
  // Neon's Vercel integration provides so it works without extra config.
  const url =
    process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL;
  if (!url) throw new Error('A database URL must be set (DIRECT_DATABASE_URL / DATABASE_URL)');

  // A short-lived, non-pooled client; `max: 1` is required by the migrator.
  // Swallow NOTICEs — rls.sql runs `DROP POLICY IF EXISTS` idempotently every
  // deploy, which harmlessly NOTICEs "does not exist, skipping" on a fresh DB.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  console.log('[migrate] applying drizzle migrations…');
  await migrate(db, { migrationsFolder: './drizzle' });

  const rlsPath = join(process.cwd(), 'drizzle', 'rls.sql');
  try {
    const rls = readFileSync(rlsPath, 'utf8');
    console.log('[migrate] applying RLS policies…');
    await db.execute(sql.raw(rls));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[migrate] no rls.sql found, skipping');
    } else {
      throw err;
    }
  }

  console.log('[migrate] done');
  await client.end();
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
