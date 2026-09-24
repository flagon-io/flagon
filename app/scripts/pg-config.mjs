// pg client/pool config with SSL pinned in code (mirrors src/lib/db.ts). We strip
// `sslmode` from the URL so pg-connection-string doesn't emit its deprecation
// warning about `require`/`prefer`/`verify-ca` aliasing `verify-full`, and set
// `ssl` explicitly: off only for a local `disable`, full verification otherwise.
export function pgConfig(raw = process.env.DATABASE_URL) {
  if (!raw) return {};
  let url;
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
