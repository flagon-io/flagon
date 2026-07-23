-- Publication tracking for the OFREP config store, so a failed write-through is
-- detectable and self-healing rather than silently serving a stale artifact.
--
-- OFREP evaluation reads each org's flag+segment artifact from object storage
-- (R2), falling back to the database on a miss. The risk is a "stale but
-- present" object: a mutation commits, the write-through to R2 fails, and R2
-- keeps serving the OLD artifact with a valid ETag - stale forever, with no
-- signal that anything is wrong.
--
-- The fix mirrors the usage-compaction marker (drizzle/0025): a dirty bit on
-- `organizations`, a table the app can read WITHOUT a tenant context. It is set
-- in the SAME transaction as the flag/segment change (so the intent to publish
-- commits atomically with the change - a crash or an R2 outage cannot lose it),
-- and cleared only once the artifact is safely written. The reconcile cron
-- sweeps whatever is still set. The remaining columns record what is currently
-- in the store, so "which orgs are dirty, and for how long" is a cheap query
-- rather than a cross-tenant scan.
ALTER TABLE organizations
  ADD COLUMN config_pending_at   timestamptz,
  ADD COLUMN config_version      text,
  ADD COLUMN config_checksum     text,
  ADD COLUMN config_published_at timestamptz;

-- Partial, and tiny: only the orgs awaiting a (re)publish, which at steady
-- state is none. This is the index the reconcile sweep drives off.
CREATE INDEX organizations_config_pending_idx
  ON organizations (config_pending_at)
  WHERE config_pending_at IS NOT NULL;

-- Every existing org with flags or segments has never been published to the
-- store, so mark them all dirty once: the first reconcile run materialises
-- their artifacts. Fails toward work, exactly like 0025.
UPDATE organizations o
SET config_pending_at = now()
WHERE EXISTS (SELECT 1 FROM feature_flags f WHERE f.organization_id = o.id)
   OR EXISTS (SELECT 1 FROM segments s WHERE s.organization_id = o.id);

-- organizations is auth-layer (see src/db/tenancy.test.ts): no RLS, grants from
-- drizzle/0007. Adding columns needs no new grant and does not change its
-- classification.
