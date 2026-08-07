# Migrations

The API's schema lives in [`../src/db/schema.ts`](../src/db/schema.ts) (the query-builder
source of truth). SQL migrations here are applied by [`../src/db/migrate.ts`](../src/db/migrate.ts)
(Drizzle's `postgres-js` migrator, run as the owner) — **not** by `drizzle-kit`.

## Adding a migration

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — Drizzle diffs `schema.ts` against the snapshot and writes a new
   `NNNN_<name>.sql` + `meta/NNNN_snapshot.json` and appends to `meta/_journal.json`.
3. **Hand-add the custom SQL `drizzle-kit` cannot express** to the generated `.sql`:
   row-level security, `GRANT`s, data backfills, `CHECK`s, ordering. Reuse the
   `flagon_apply_tenant_rls(...)` helper for any new `organization_id` table, and guard
   `flagon_app` grants with `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='flagon_app')`
   (see the baseline + past migrations for the pattern). RLS is **required** on tenant
   tables — the `tenancy.audit` test fails the build otherwise.
4. `npm run db:migrate` locally to apply, then commit the `.sql`, snapshot, and journal.

CI runs a **drift check** (`db:generate` must be a no-op) so a `schema.ts` change without a
matching migration turns the build red.

## Timestamps

Journal `when` values are now real `Date.now()` (what `db:generate` stamps). Do not
hand-set them.

## Baseline (history)

`0000_baseline.sql` is a **squash** of the original migrations `0000–0046` (Aug 2026): the
full schema as one file, generated from `pg_dump` of a fully-migrated database and validated
byte-for-byte. Its journal `when=1`, so it is **skipped** on any database that already has
the schema (production) and only runs to build a **fresh** one (CI, local, a new region).

The squash required a one-time reset of production's `drizzle.__drizzle_migrations` (its old
synthetic high-water mark was ~40 days ahead of real time, which would have skipped new
migrations) via `npm run db:rebaseline` (`scripts/rebaseline-prod.ts`, `CONFIRM_REBASELINE=1`).
That is done; the script is idempotent and kept for reference.
