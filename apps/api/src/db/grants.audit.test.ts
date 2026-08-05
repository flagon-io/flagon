import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * The GRANT guarantee, made MECHANICAL.
 *
 * Every migration that CREATES a table must also GRANT the restricted runtime
 * role (`flagon_app`) full CRUD on it. That role — NOT the owner — is what the
 * app and the API connect as in production (`APP_DATABASE_URL`). A table created
 * without a grant appears to work locally and used to pass CI (a blanket grant
 * masked it), then EXPLODES in production with `permission denied for table ...`.
 * That is exactly how the SSO/SCIM/2FA tables broke on 2026-08-05: migration
 * 0003 created six tables and forgot to grant them (fixed in 0004).
 *
 * This test asserts every table in `public` grants `flagon_app`
 * SELECT/INSERT/UPDATE/DELETE. CI now creates `flagon_app` BEFORE migrations and
 * no longer blanket-grants, so a missing per-migration grant fails right here.
 * It runs only where `flagon_app` exists (CI + prod-shaped databases); in
 * single-role local dev (owner-only) it soft-skips, mirroring the grant
 * migrations, which are themselves guarded on the role existing.
 *
 * Runs only where a database is reachable (CI applies migrations first, or
 * locally with DATABASE_URL set); skipped otherwise so `npm test` needs no infra.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("grants: every table is reachable by flagon_app", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, { max: 1 });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("every public table grants flagon_app full CRUD (or the role is absent → skip)", async () => {
    // Single-role dev connects as the owner and never creates flagon_app; the
    // grant migrations no-op there, so there is nothing to assert.
    const role = await sql`SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app'`;
    if (role.length === 0) return;

    const missing = (await sql`
      SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT (
          has_table_privilege('flagon_app', c.oid, 'SELECT') AND
          has_table_privilege('flagon_app', c.oid, 'INSERT') AND
          has_table_privilege('flagon_app', c.oid, 'UPDATE') AND
          has_table_privilege('flagon_app', c.oid, 'DELETE')
        )
      ORDER BY c.relname
    `) as { table: string }[];

    const names = missing.map((m) => m.table);
    expect(
      names,
      `Tables in 'public' that the restricted app role (flagon_app) cannot fully ` +
        `access — this WILL be "permission denied" in production. Add a GRANT to ` +
        `the migration that creates them, guarded on the role (see 0000_auth / ` +
        `0004_sso_scim_grants): ${names.join(", ")}`,
    ).toEqual([]);
  });
});
