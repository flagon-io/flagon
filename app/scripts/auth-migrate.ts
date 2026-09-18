// Apply BetterAuth's schema migrations using the INSTALLED better-auth version,
// so the migration always matches the runtime.
//
// The standalone `@better-auth/cli` is deprecated and its latest release lags the
// library (no 1.7.x), which is what produced the schema-type-drift warning
// (e.g. rateLimit.lastRequest). BetterAuth exposes the same migration engine the
// CLI used via `better-auth/db/migration`, so we drive it directly against the
// real auth config. Run through tsx (see the db:migrate / deploy-migrate steps)
// so this can import `@/lib/auth` with its TypeScript + path aliases - the config
// is the single source of truth, so the migration can never drift from what the
// app actually runs with.
import { getMigrations } from "better-auth/db/migration";
import { auth } from "@/lib/auth";

async function main() {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

  const created = toBeCreated.map((t) => t.table);
  const altered = toBeAdded.map((t) => t.table);

  if (created.length === 0 && altered.length === 0) {
    console.log("BetterAuth schema is up to date.");
    return;
  }

  const summary = [
    created.length ? `create [${created.join(", ")}]` : null,
    altered.length ? `alter [${altered.join(", ")}]` : null,
  ]
    .filter(Boolean)
    .join("; ");
  console.log(`Applying BetterAuth migrations: ${summary}`);
  await runMigrations();
  console.log("BetterAuth migrations complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("BetterAuth migration failed:", err);
    process.exit(1);
  });
