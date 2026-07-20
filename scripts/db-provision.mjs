// Provisions the RESTRICTED app role (flagon_app) from DATABASE_URL_APP, using
// the OWNER connection. Idempotent and safe to run on every deploy.
//
// This only creates/updates OUR role and its grants. It never modifies the
// managed owner role or any provider-injected credentials, so it is safe to run
// against Neon (or any managed Postgres) alongside their integration.
import { config } from "dotenv";
import postgres from "postgres";
import { resolveAppUrl, resolveOwnerUrl } from "./db-urls.mjs";

config({ path: [".env.local", ".env"] });

const appUrl = resolveAppUrl();
const ownerUrl = resolveOwnerUrl();

if (!appUrl || !ownerUrl) {
  console.log(
    "db:provision - need an app URL (DATABASE_URL_APP or FLAGON_APP_PASSWORD) and an owner URL; skipping.",
  );
  process.exit(0);
}

const parsed = new URL(appUrl);
const role = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role)) {
  console.error(`Refusing to provision unsafe role name: ${role}`);
  process.exit(1);
}
if (!password) {
  console.error("DATABASE_URL_APP has no password.");
  process.exit(1);
}

const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const ident = (s) => `"${s.replace(/"/g, '""')}"`;
const R = ident(role);

const sql = postgres(ownerUrl, { max: 1 });

try {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit(role)}) THEN
        CREATE ROLE ${R} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END
    $$;
  `);

  // Keep login + password in sync with DATABASE_URL_APP. Only these two: on
  // managed Postgres (Neon) the owner has CREATEROLE, not SUPERUSER, and
  // Postgres rejects any ALTER ROLE that mentions SUPERUSER/BYPASSRLS (even as
  // a no-op like NOSUPERUSER) unless run by a real superuser. The restrictive
  // attributes are locked in at CREATE ROLE above and only a superuser could
  // ever loosen them.
  await sql.unsafe(
    `ALTER ROLE ${R} WITH LOGIN PASSWORD ${lit(password)};`,
  );

  if (dbName) {
    await sql.unsafe(`GRANT CONNECT ON DATABASE ${ident(dbName)} TO ${R};`);
  }
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${R};`);

  // NO blanket table grants and NO default privileges, deliberately: every
  // migration GRANTs the app role its tables explicitly alongside their RLS
  // policy (or auth-layer classification in src/db/tenancy.test.ts). A table
  // nobody classified is unreachable - it fails closed instead of leaking
  // across tenants. The REVOKEs below retire the auto-grant from earlier
  // versions of this script (idempotent; no-ops once clean).
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${R};`,
  );
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM ${R};`,
  );

  console.log(`Provisioned role ${role}.`);
} finally {
  await sql.end();
}
