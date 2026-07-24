-- Remove the Enterprise plan tier and its negotiated-deal machinery.
--
-- The public alpha ships with two plans we actually run - Hobby (free) and Pro
-- (subscription) - and Enterprise as a "coming soon" marketing surface only. The
-- contract/proposal/entitlement-override system that backed Enterprise is
-- removed wholesale; discounts are handled with Stripe coupons instead, and a
-- plan is tuned by editing its plan_versions row.
--
-- ORDER: repoint any lingering references first, THEN drop. The production org
-- is migrated to Pro + a 100%-off coupon out of band (a runbook using the
-- operator console) BEFORE this runs, so the UPDATEs below are a safety net for
-- any org the runbook missed rather than a change to a live customer.

-- --------------------------------------------------------------------------
-- 1. Safety net: no org may reference an enterprise version or sit on the
--    enterprise plan when the rows below are deleted.
-- --------------------------------------------------------------------------
UPDATE organizations SET plan_version_id = NULL
  WHERE plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'enterprise');

UPDATE organizations SET pending_plan_version_id = NULL
  WHERE pending_plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'enterprise');

-- An org left on 'enterprise' would resolve to the fail-closed 'free' in code;
-- make the intent explicit instead. (The runbook should have moved it to Pro.)
UPDATE organizations SET plan = 'pro', updated_at = now() WHERE plan = 'enterprise';

-- --------------------------------------------------------------------------
-- 2. Drop the negotiated-deal tables. Their grants and RLS policies go with
--    them; plan_version_meters cascades from plan_versions below.
-- --------------------------------------------------------------------------
DROP TABLE IF EXISTS org_proposals;     -- global/token-authorized offers
DROP TABLE IF EXISTS org_contracts;     -- tenant-RLS enterprise envelope
DROP TABLE IF EXISTS org_entitlements;  -- per-org negotiated override

-- --------------------------------------------------------------------------
-- 3. Delete the enterprise catalog rows (cascades plan_version_meters).
-- --------------------------------------------------------------------------
DELETE FROM plan_versions WHERE plan = 'enterprise';

-- --------------------------------------------------------------------------
-- 4. Tighten the plan CHECK so enterprise can't be re-seeded. The constraint
--    was created inline on plan_prices in 0035 (auto-named plan_prices_plan_check)
--    and carried through the 0037 table rename unchanged.
-- --------------------------------------------------------------------------
ALTER TABLE plan_versions DROP CONSTRAINT IF EXISTS plan_prices_plan_check;
ALTER TABLE plan_versions
  ADD CONSTRAINT plan_versions_plan_check CHECK (plan IN ('free', 'pro'));

-- --------------------------------------------------------------------------
-- 5. Hobby now advertises the self-hostable open-source build. Idempotent:
--    only appends the bullet if it is not already present.
-- --------------------------------------------------------------------------
UPDATE plan_versions
  SET features = features || '["Or self-host the open-source version, free forever"]'::jsonb
  WHERE plan = 'free'
    AND status = 'active'
    AND NOT (features @> '["Or self-host the open-source version, free forever"]'::jsonb);

-- NOT TOUCHED, deliberately:
--   * billing_period_lines.billing_mode still accepts 'covered'/'metered':
--     historical periods closed under contract billing hold those values and
--     must stay readable. New closes only ever write 'priced'.
--   * billing_periods.plan may still record 'enterprise' on historical closed
--     periods; it has no CHECK and must stay readable.
--   * organizations.plan has no CHECK constraint (validated in app via isPlanId).
