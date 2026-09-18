// Development-only helper: offer to pre-fill the seeded demo account on the
// login screen, but ONLY when it actually exists (i.e. you ran `npm run db:seed`).
// Never active in production. Server-only (touches the database).
import { pool } from "@/lib/db";

// These defaults must match app/scripts/seed.mjs.
const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@flagon.dev";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "password12345";

export type DemoAutofill = { identifier: string; password: string };

/**
 * Returns the demo credentials to pre-fill, or null. Null when running in
 * production, when the database is unreachable, or when the demo user hasn't
 * been seeded - so this only ever kicks in on a dev machine that opted in by
 * seeding.
 */
export async function getDemoAutofill(): Promise<DemoAutofill | null> {
  if (process.env.NODE_ENV === "production") return null;

  try {
    const { rowCount } = await pool.query(
      `select 1 from users where email = $1 limit 1`,
      [DEMO_EMAIL],
    );
    if (!rowCount) return null;
    return { identifier: DEMO_EMAIL, password: DEMO_PASSWORD };
  } catch {
    // No DB / not migrated yet: just don't offer autofill.
    return null;
  }
}
