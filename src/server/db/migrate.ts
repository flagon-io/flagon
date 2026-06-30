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

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL must be set');

  // A short-lived, non-pooled client; `max: 1` is required by the migrator.
  const client = postgres(url, { max: 1 });
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
