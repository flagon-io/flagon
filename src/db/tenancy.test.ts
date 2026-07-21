import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Tenancy audit: proves, from the database catalog itself, that no code path
 * can reach tenant data without row-level security.
 *
 * The invariant: the app role (flagon_app) can never bypass RLS, receives no
 * automatic privileges, and every table it CAN reach is either
 *   - classified below as AUTH-LAYER/GLOBAL (access-checked in application
 *     or plugin code, deliberately queried outside a tenant context), or
 *   - protected by an app.current_org_id tenant policy (deny-by-default
 *     when the GUC is unset).
 * A table that is neither - e.g. a new migration that forgot RLS - fails
 * this audit, and (because there are no default privileges) is unreachable
 * by the app in the meantime: it fails closed instead of leaking.
 *
 * Adding a table? Its migration must GRANT the app role explicitly and
 * either add the tenant policy or (with justification) extend this list.
 */
const AUTH_LAYER_TABLES = new Set([
  // BetterAuth global auth tables: no org scope by nature.
  "users",
  "sessions",
  "accounts",
  "verifications",
  // Multi-email source of truth; keyed by user, not org.
  "user_emails",
  // Rate limiter storage; keyed by client identifier.
  "rate_limits",
  // Organization layer: the plugin membership-checks every operation and
  // queries these outside any tenant GUC (e.g. "list my orgs"). See
  // drizzle/0007 + 0008 for the reconciliation notes.
  "organizations",
  "members",
  "invitations",
  "teams",
  "team_members",
  // Sales-lead intake; internal tooling, not tenant data.
  "leads",
  // Token hashes span user- and organization-owned credentials and must be
  // discoverable before an org RLS context exists. Every lookup is a digest
  // match and scope/subject checks happen in access-tokens.server.ts.
  "access_tokens",
]);

/** Tables the app role must have NO access to at all. */
const OWNER_ONLY_TABLES = new Set(["schema_migrations"]);

const ownerUrl = process.env.DATABASE_URL_OWNER;
const appUrl = process.env.DATABASE_URL_APP;
const canRun = Boolean(ownerUrl && appUrl);

describe.skipIf(!canRun)("tenancy audit", () => {
  let owner: ReturnType<typeof postgres>;
  let app: ReturnType<typeof postgres>;
  let appRole = "";

  beforeAll(async () => {
    owner = postgres(ownerUrl as string, { max: 1 });
    app = postgres(appUrl as string, { max: 1 });
    const [{ current_user }] = await app`SELECT current_user`;
    appRole = current_user as string;
  });

  afterAll(async () => {
    await owner?.end();
    await app?.end();
  });

  it("app role can never bypass RLS", async () => {
    const [role] = await app`
      SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
      FROM pg_roles WHERE rolname = current_user
    `;
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
    expect(role.rolcreaterole).toBe(false);
    expect(role.rolcreatedb).toBe(false);
  });

  it("no default privileges auto-grant the app role future tables", async () => {
    const rows = await owner`
      SELECT defaclacl::text AS acl FROM pg_default_acl
    `;
    for (const row of rows) {
      expect(row.acl, "default ACL must not mention the app role").not.toContain(
        appRole,
      );
    }
  });

  it("every table is classified: auth-layer, tenant-isolated, or unreachable", async () => {
    const tables = await owner`
      SELECT c.relname AS name,
             c.relrowsecurity AS rls,
             has_table_privilege(${appRole}, c.oid, 'SELECT') AS can_select,
             has_table_privilege(${appRole}, c.oid,
               'SELECT, INSERT, UPDATE, DELETE') AS has_any
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    const policies = await owner`
      SELECT c.relname AS table, pg_get_expr(p.polqual, p.polrelid) AS qual
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
    `;
    const tenantPolicied = new Set(
      policies
        .filter((p) => (p.qual as string)?.includes("app.current_org_id"))
        .map((p) => p.table as string),
    );

    const seen = new Set<string>();
    for (const table of tables) {
      const name = table.name as string;
      seen.add(name);

      if (OWNER_ONLY_TABLES.has(name)) {
        expect(table.has_any, `${name} must be owner-only`).toBe(false);
        continue;
      }
      if (AUTH_LAYER_TABLES.has(name)) {
        expect(table.can_select, `${name} should be reachable (auth-layer)`).toBe(true);
        continue;
      }
      // Everything else is product data: it must be tenant-isolated. An
      // unreachable unclassified table also fails here - on purpose, so a
      // half-finished migration is caught in CI, not discovered in prod.
      expect(
        table.rls,
        `${name} is unclassified: enable RLS with the app.current_org_id policy, or classify it in this audit`,
      ).toBe(true);
      expect(
        tenantPolicied.has(name),
        `${name} has RLS but no app.current_org_id tenant policy`,
      ).toBe(true);
      expect(table.can_select, `${name} needs an explicit GRANT`).toBe(true);
    }

    // Stale classifications rot the audit: every listed table must exist.
    for (const name of [...AUTH_LAYER_TABLES, ...OWNER_ONLY_TABLES]) {
      expect(seen.has(name), `${name} is classified but does not exist`).toBe(true);
    }
  });

  it("tenant tables deny by default without the org GUC", async () => {
    const tenantTables = await owner`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      ORDER BY c.relname
    `;
    expect(tenantTables.length).toBeGreaterThan(0);
    for (const { name } of tenantTables) {
      // Fresh app connection state: no GUC set -> zero rows, every table.
      const [{ count }] = await app.unsafe(
        `SELECT count(*)::int AS count FROM "${name}"`,
      );
      expect(count, `${name} must deny by default`).toBe(0);
    }
  });
});
