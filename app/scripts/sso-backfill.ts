// One-time backfill: hand every SSO provider that predates API ownership (it lives
// only in the auth DB's sso_providers table) to the Flagon API, which is now the
// source of truth for SSO configuration.
//
// Each provider goes through the API's idempotent internal import: one the API has
// never seen is adopted into its org (and audited), one it already owns is left
// alone, and one deleted through the API is never brought back. The cache row is
// then rewritten from the API's answer. Safe to run any number of times.
//
// Running it is optional: the first SSO sign-in through a pre-API provider adopts
// it the same way (lib/sso-sync.ts). Run it after deploying to adopt every
// provider up front instead of lazily.
//
//   FLAGON_API_URL=... FLAGON_INTERNAL_TOKEN=... DATABASE_URL=... npm run sso:backfill
import { pool } from "../src/lib/db";
import { backfillSSOProviders } from "../src/lib/sso-sync";

async function main() {
  const tally = await backfillSSOProviders();
  console.log("[sso-backfill] done:", JSON.stringify(tally));
  if (tally.failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("[sso-backfill] failed", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
