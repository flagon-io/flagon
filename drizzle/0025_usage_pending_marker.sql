-- A pending-work marker, so compaction stops scanning every organization.
--
-- The sweep in 0024 enumerated `organizations` and asked each one whether it
-- had pending events, because the obvious query - "which orgs have
-- uncompacted rows" - is a cross-tenant scan of tenant data, which is exactly
-- what RLS exists to forbid. That made the sweep O(orgs) per run, and the cost
-- lands on the orgs that are IDLE: a thousand quiet organizations means a
-- thousand pointless transactions every cron tick.
--
-- The fix is not a weaker policy, it is a marker on a table the app can
-- already read without a tenant context. usage_events stays fully isolated;
-- what leaks out is one bit per org - "has work" - which is not tenant data in
-- any meaningful sense and is already implied by the org's own existence.
--
-- Set when an event is recorded, cleared only when a compaction run drains the
-- org completely. The asymmetry is deliberate: a marker left set costs one
-- wasted scan, a marker cleared early loses usage. It fails toward work.

ALTER TABLE organizations
  ADD COLUMN usage_pending_at timestamptz;

-- Partial, and tiny: it indexes only the orgs with work outstanding, which at
-- steady state is a handful. This is the index the sweep drives off.
CREATE INDEX organizations_usage_pending_idx
  ON organizations (usage_pending_at)
  WHERE usage_pending_at IS NOT NULL;

-- Existing organizations may already have uncompacted events from 0024, and
-- the sweep would never look at them again once it starts trusting the marker.
UPDATE organizations o
SET usage_pending_at = now()
WHERE EXISTS (
  SELECT 1 FROM usage_events e
  WHERE e.organization_id = o.id AND e.compacted_at IS NULL
);

-- organizations is auth-layer (see src/db/tenancy.test.ts): it carries no RLS
-- and its grants were established in drizzle/0007. Adding a column needs no
-- new grant, and the tenancy audit's classification is unchanged.
