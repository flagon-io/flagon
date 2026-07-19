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

  // Keep attributes + password in sync with DATABASE_URL_APP.
  await sql.unsafe(
    `ALTER ROLE ${R} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${lit(password)};`,
  );

  if (dbName) {
    await sql.unsafe(`GRANT CONNECT ON DATABASE ${ident(dbName)} TO ${R};`);
  }
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${R};`);
  await sql.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${R};`,
  );
  await sql.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${R};`,
  );
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${R};`,
  );
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${R};`,
  );

  console.log(`Provisioned role ${role}.`);
} finally {
  await sql.end();
}
