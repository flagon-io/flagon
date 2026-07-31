/**
 * Purge leftover test/dev organizations from a LOCAL database.
 *
 * Manual browser testing (creating orgs, renaming, upgrading) leaves throwaway
 * orgs behind — test-*, vet-*, hob-*, pro-*, ren-*, etc. This hard-deletes every
 * org EXCEPT the validation org (VALIDATION_ORG_SLUG, default "flagon"), with all
 * their org-scoped rows, in FK-safe child->parent order inside one transaction.
 *
 * This is a LOCAL cleanup for ephemeral data — deliberately a hard delete, NOT the
 * product's guarded soft-delete flow. Do NOT point it at a real database.
 *
 * Dry-run by default (lists what it WOULD remove); pass --apply to delete. Runs as
 * the OWNER DB role, so use DATABASE_URL (not the restricted APP_DATABASE_URL).
 *
 * Usage (from apps/api):
 *   npm run purge:test-orgs              # dry run: list the orgs that would go
 *   npm run purge:test-orgs -- --apply   # actually delete them
 */
import postgres from "postgres";

const VALIDATION_ORG_SLUG = process.env.VALIDATION_ORG_SLUG ?? "flagon";
const apply = process.argv.includes("--apply");

// Every table carrying organization_id, child -> parent, so a delete never trips
// a foreign key. Kept in sync with the org-scoped schema.
const ORDER = [
  "entity_attributes",
  "flag_variants",
  "flag_environments",
  "flag_rules",
  "flag_revisions",
  "flag_eval_rollups",
  "usage_event_rollups",
  "sdk_keys",
  "segments",
  "entities",
  "environments",
  "flags",
  "projects",
  "invitations",
  "members",
  "access_tokens",
];

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL / APP_DATABASE_URL set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const targets = await sql`
      SELECT id, slug, plan FROM organizations WHERE slug <> ${VALIDATION_ORG_SLUG} ORDER BY created_at`;
    if (targets.length === 0) {
      console.log(`Nothing to purge. Only the validation org "${VALIDATION_ORG_SLUG}" remains.`);
      return;
    }

    console.log(`${apply ? "Deleting" : "Would delete"} ${targets.length} org(s) (keeping "${VALIDATION_ORG_SLUG}"):`);
    for (const o of targets) console.log(`  - ${o.slug} (${o.plan}) ${o.id}`);

    if (!apply) {
      console.log("\nDry run. Re-run with --apply to delete.");
      return;
    }

    const ids = targets.map((o) => o.id);
    await sql.begin(async (tx) => {
      for (const table of ORDER) {
        const r = await tx`DELETE FROM ${tx(table)} WHERE organization_id = ANY(${ids})`;
        if (r.count > 0) console.log(`  ${table}: ${r.count}`);
      }
      const o = await tx`DELETE FROM organizations WHERE id = ANY(${ids})`;
      console.log(`  organizations: ${o.count}`);
    });

    const remaining = await sql`SELECT slug FROM organizations ORDER BY created_at`;
    console.log(`\nDone. Organizations remaining: ${remaining.map((r) => r.slug).join(", ") || "(none)"}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[purge:test-orgs] failed:", err);
  process.exit(1);
});
