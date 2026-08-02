import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * The tenancy guarantee, made MECHANICAL.
 *
 * Every table that carries an `organization_id` must enforce Postgres row-level
 * security — enabled, FORCEd, and backed by at least one policy — UNLESS it is
 * explicitly listed below as an auth-layer table whose isolation is enforced by
 * the application (BetterAuth) instead of RLS.
 *
 * The effect: a new org-scoped table that ships without RLS, and without a
 * deliberate entry in the exempt set, turns this test RED. The repo fails
 * CLOSED — you cannot forget RLS on tenant data and still get a green build.
 *
 * Runs only where a database is reachable (CI applies the migrations first, or
 * locally with DATABASE_URL set); skipped otherwise so the default `npm test`
 * needs no infrastructure.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

// Auth-layer tables: org isolation is enforced by BetterAuth at the application
// layer (a user belongs to many orgs; the framework scopes by session and
// membership), NOT by RLS. Adding a name here is a deliberate, reviewable
// classification — not a way to silence the check.
const AUTH_LAYER_EXEMPT = new Set([
  "members",
  "invitations",
  "access_tokens",
  // A CREDENTIAL table: an client key must resolve to its org before any org
  // context exists, so it can't be gated by app.current_org_id RLS. Looked up by
  // unique high-entropy hash; management is org-scoped in the app layer.
  "client_keys",
]);

type Row = {
  relname: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
};

describe.skipIf(!DATABASE_URL)("tenancy: org tables enforce RLS", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, { max: 1 });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("every organization_id table has RLS forced + a policy (or is exempt)", async () => {
    const rows = (await sql`
      SELECT c.relname,
             c.relrowsecurity      AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname = 'organization_id'
            AND NOT a.attisdropped
        )
      ORDER BY c.relname
    `) as unknown as Row[];

    const violations = rows
      .filter((r) => !AUTH_LAYER_EXEMPT.has(r.relname))
      .filter((r) => !(r.rls_enabled && r.rls_forced && r.policy_count > 0))
      .map((r) => r.relname);

    expect(
      violations,
      `Tenant tables carrying organization_id but missing forced RLS + a policy: ${violations.join(", ")}. Add an RLS policy (see 0002_flags_rls.sql) or, if this is deliberately app-layer, add it to AUTH_LAYER_EXEMPT with justification.`,
    ).toEqual([]);
  });
});
