import { Pool, type PoolConfig } from "pg";

// Shared across better-auth and our own custom queries (e.g. user_emails).
// Lazy connect: safe to construct with no DATABASE_URL set yet.
//
// SSL is pinned in code rather than through the URL's `sslmode`. pg-connection-string
// currently treats `require`/`prefer`/`verify-ca` as `verify-full`, but warns that in
// its next major they'll adopt weaker libpq semantics. We strip `sslmode` from the
// string (which silences that deprecation warning) and set `ssl` explicitly: off only
// for a local `disable`, full certificate verification everywhere else - the secure
// behavior the alias resolves to today, made intentional.
function poolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) return {};
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { connectionString: raw };
  }
  const mode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: mode === "disable" ? false : { rejectUnauthorized: true },
  };
}

export const pool = new Pool(poolConfig());
