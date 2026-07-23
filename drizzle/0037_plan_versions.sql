-- Plans become DATA.
--
-- 0035 moved the PRICE into the database and left everything a price implies -
-- what it includes, what it ceilings, what the pricing page says about it - in
-- TypeScript constants (src/lib/plans.ts). That was half a step, and the half
-- it skipped is the half that gets edited: "charge less for Pro and give them
-- 100M evaluations" still meant a code change, a review, and a deploy, and the
-- marketing copy describing the old number sat in a third place again.
--
-- This migration finishes it. A plan version is ONE ROW that carries the price,
-- the entitlements, the limits, and the words customers read. flagon resolves
-- entitlements from it; the pricing page renders from it; the operator console
-- edits it. There is no second copy to drift.
--
-- THREE THINGS THIS FIXES, all of which were symptoms of the same cause:
--
--   Hobby was modelled as a $0 subscription with "$10 of credit". It is not a
--   subscription and there is no credit - it is an unbilled tier with ceilings.
--   `billable` makes that a first-class property instead of a $0 fiction, and
--   per-meter included/cap quantities let Hobby be described as "10M
--   evaluations" directly, which is what it actually is.
--
--   Rates were global per meter, so a plan could change what it INCLUDED but
--   never what a unit COST. plan_version_meters carries a per-plan rate, so a
--   plan can be re-priced without touching the published rate every other plan
--   is billed at.
--
--   Marketing copy lived in constants, so a price change shipped a page that
--   still described the old one. The copy is now on the same row as the number
--   it describes.
--
-- VERSIONING IS THE POINT. Publishing a new version supersedes the old one for
-- NEW subscriptions and moves nobody: an org points at the version it bought
-- and keeps it until deliberately moved. Usage already closed is priced from
-- the rate frozen onto its billing period (0017); usage going forward is priced
-- from the version the org is on. Both halves of "the old usage was against the
-- old plan" therefore hold without any dated rate lookup.

-- ---------------------------------------------------------------------------
-- The meter catalog, as a table.
-- ---------------------------------------------------------------------------
--
-- Meters are declared in code (src/lib/meters.ts) because they are wired to
-- instrumentation: flagon cannot record `flags.evaluations` unless something
-- emits it. But the operator console needs their labels and units to render an
-- editor, and it cannot import flagon's TypeScript.
--
-- So the catalog is mirrored here and a test (src/lib/meters.test.ts) fails if
-- the two ever disagree. Code remains the source of truth for EXISTENCE; this
-- table is how anything outside flagon reads it. Adding a product means adding
-- the meter to the registry and inserting it here in the same migration.
CREATE TABLE meters (
  id text PRIMARY KEY,
  product text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- The rate charged when no plan version overrides it. Kept because a meter
  -- must still be priceable for an enterprise org billing outside any plan.
  unit_amount_cents integer NOT NULL DEFAULT 0,
  per bigint NOT NULL DEFAULT 1000000,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO meters (id, product, label, unit, description, unit_amount_cents, per, sort_order) VALUES
  ('flags.evaluations', 'flags', 'Flag evaluations', 'events',
   'Every flag decision served, however it was requested.', 100, 1000000, 10),
  ('flags.syncs', 'flags', 'Configuration syncs', 'sync events',
   'Each full configuration payload served to an SDK. Revalidations that return 304 are free.', 75, 1000000, 20);

GRANT SELECT ON meters TO flagon_app;

-- ---------------------------------------------------------------------------
-- plan_versions: the whole plan, versioned.
-- ---------------------------------------------------------------------------
--
-- Reshaped from plan_prices (0035) rather than replacing it, so a deployment
-- that already applied 0035 keeps its rows and its organizations.plan_price_id
-- references instead of needing them rebuilt.
ALTER TABLE plan_prices RENAME TO plan_versions;
ALTER INDEX plan_prices_one_active_idx RENAME TO plan_versions_one_active_idx;
ALTER INDEX plan_prices_plan_idx RENAME TO plan_versions_plan_idx;

ALTER TABLE plan_versions
  -- IS THIS A SUBSCRIPTION AT ALL?
  --
  -- False for Hobby. An unbilled tier has no Stripe price, generates no
  -- invoice, and must never be rendered as "$0.00/month" next to plans that
  -- are real money - which is exactly what made the console confusing. Every
  -- surface branches on this rather than on `plan = 'free'`, so a future
  -- unbilled tier behaves correctly without special-casing its name.
  ADD COLUMN billable boolean NOT NULL DEFAULT true,

  -- The Stripe product this version's price belongs to. Sharing one product
  -- across a plan's versions is what keeps Stripe's revenue reporting grouped
  -- by plan while each version carries its own amount.
  ADD COLUMN stripe_product_id text,

  -- Monotonic within a plan, for display ("Pro v3") and ordering. The label is
  -- what humans read; this is what sorts.
  ADD COLUMN version integer NOT NULL DEFAULT 1,

  -- --- Marketing -----------------------------------------------------------
  -- On the same row as the price, because copy that describes a number and the
  -- number itself drifting apart is the failure this is here to prevent.
  ADD COLUMN display_name text NOT NULL DEFAULT '',
  ADD COLUMN tagline text NOT NULL DEFAULT '',
  -- Feature bullets, in order. Supports {tokens} interpolated at render time
  -- (see src/lib/plan-copy.ts) so a bullet can quote the plan's own numbers and
  -- never go stale: "{credit} of included usage" re-renders when the credit moves.
  ADD COLUMN features jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Shown on the pricing page? Enterprise is listed but not self-serve; a draft
  -- or a grandfathered version is not listed at all.
  ADD COLUMN listed boolean NOT NULL DEFAULT false,
  -- The emphasised column ("Popular"). At most one should be true.
  ADD COLUMN highlight boolean NOT NULL DEFAULT false,
  -- Can a customer pick this themselves? Enterprise is contact-only.
  ADD COLUMN self_serve boolean NOT NULL DEFAULT false,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,

  -- --- Limits (what a plan may CREATE, as opposed to consume) --------------
  -- NULL means unlimited. Distinct from the meter ceilings below, which govern
  -- consumption; these govern shape.
  ADD COLUMN max_projects integer,
  ADD COLUMN max_members integer,
  ADD COLUMN max_free_orgs integer;

-- Amount and credit are nullable now: an unbilled tier has neither, and
-- enterprise is priced per contract rather than from the catalog.
ALTER TABLE plan_versions ALTER COLUMN unit_amount_cents DROP NOT NULL;
ALTER TABLE plan_versions ALTER COLUMN included_credit_cents DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- plan_version_meters: what each plan gives you, per meter.
-- ---------------------------------------------------------------------------
--
-- Replaces the meter_allowances / hard_caps jsonb blobs on plan_prices with
-- real rows, because these are now EDITED rather than just read: a row can be
-- constrained, indexed, and shown in a table without the console having to
-- reconcile two parallel objects keyed by meter id.
--
-- The three modes are genuinely different products, not degrees of one:
--
--   included    A quantity comes with the plan. Past it, `unit_amount_cents`
--               per `per` units - or refusal, if hard_cap is set.
--   metered     Nothing included; every unit is billed from the first.
--   unavailable The plan does not offer this product at all. A future product
--               that Hobby simply does not get is this, not an allowance of 0
--               (which would read as "included, but none", and bill on use).
CREATE TABLE plan_version_meters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  plan_version_id uuid NOT NULL
    REFERENCES plan_versions(id) ON DELETE CASCADE,
  meter text NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,

  mode text NOT NULL DEFAULT 'included'
    CHECK (mode IN ('included', 'metered', 'unavailable')),

  -- Units included each cycle before pricing starts. "Hobby gets 10M things."
  included_quantity bigint NOT NULL DEFAULT 0
    CHECK (included_quantity >= 0),

  -- What a unit costs ON THIS PLAN, as `unit_amount_cents` per `per` units.
  --
  -- Cents-per-N rather than a decimal price, which is how Stripe models it and
  -- how billing_period_lines already freezes it. It is also the only way to
  -- express sub-cent pricing exactly: $0.0025 per evaluation is 250 cents per
  -- 100,000, with no rounding and no float.
  --
  -- NULL inherits the meter's published rate, so a plan that only changes an
  -- allowance need not restate the price.
  unit_amount_cents integer CHECK (unit_amount_cents >= 0),
  per bigint CHECK (per > 0),

  -- Units before requests are REFUSED. NULL = never refuse (bill instead).
  -- This is Hobby's ceiling, declared rather than derived from a credit.
  hard_cap bigint CHECK (hard_cap >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (plan_version_id, meter)
);

CREATE INDEX plan_version_meters_version_idx
  ON plan_version_meters (plan_version_id);

GRANT SELECT ON plan_version_meters TO flagon_app;

-- ---------------------------------------------------------------------------
-- Carry 0035's jsonb into rows, then drop it.
-- ---------------------------------------------------------------------------
INSERT INTO plan_version_meters (
  plan_version_id, meter, mode, included_quantity, hard_cap
)
SELECT v.id,
       m.id,
       'included',
       COALESCE((v.meter_allowances ->> m.id)::bigint, 0),
       (v.hard_caps ->> m.id)::bigint
FROM plan_versions v
CROSS JOIN meters m
ON CONFLICT (plan_version_id, meter) DO NOTHING;

ALTER TABLE plan_versions DROP COLUMN meter_allowances;
ALTER TABLE plan_versions DROP COLUMN hard_caps;

-- ---------------------------------------------------------------------------
-- Seed the plans as they are TODAY, so the database starts out agreeing with
-- the constants it supersedes. Numbers and copy are lifted from
-- src/lib/plans.ts at the time of writing.
-- ---------------------------------------------------------------------------

-- Hobby: not a subscription. No amount, no credit - ceilings instead.
UPDATE plan_versions SET
  billable = false,
  unit_amount_cents = NULL,
  included_credit_cents = NULL,
  display_name = 'Hobby',
  label = 'Hobby',
  tagline = 'The perfect starting place for a personal project.',
  features = '[
    "1 Hobby organization per account",
    "{projects} projects",
    "Solo workspace (just you)",
    "Unlimited flags",
    "{flags.evaluations.included} flag evaluations a month",
    "Never generates a bill",
    "Community support"
  ]'::jsonb,
  listed = true,
  self_serve = true,
  sort_order = 10,
  max_projects = 2,
  max_members = 1,
  max_free_orgs = 1
WHERE plan = 'free' AND status = 'active';

-- Hobby's ceilings, declared. 10M evaluations is what its old $10 credit bought
-- at the published rate; stating it directly removes a derivation that had to
-- be recomputed to be understood, and makes it one number to edit.
UPDATE plan_version_meters SET
  mode = 'included', included_quantity = 10000000, hard_cap = 10000000
WHERE meter = 'flags.evaluations'
  AND plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'free');

UPDATE plan_version_meters SET
  mode = 'included', included_quantity = 5000000, hard_cap = 5000000
WHERE meter = 'flags.syncs'
  AND plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'free');

-- Pro: a real subscription whose fee comes back as pooled usage credit.
UPDATE plan_versions SET
  billable = true,
  display_name = 'Pro',
  tagline = 'Everything you need to ship with your team.',
  features = '[
    "{credit} of included usage, pooled across every product",
    "Team collaboration, no seat pricing",
    "Unlimited projects",
    "Usage-based beyond your credit, no hard cap",
    "Standard support"
  ]'::jsonb,
  listed = true,
  highlight = true,
  self_serve = true,
  sort_order = 20
WHERE plan = 'pro' AND status = 'active';

UPDATE plan_version_meters SET
  mode = 'included', included_quantity = 0, hard_cap = NULL
WHERE meter = 'flags.evaluations'
  AND plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'pro');

UPDATE plan_version_meters SET
  mode = 'included', included_quantity = 50000000, hard_cap = NULL
WHERE meter = 'flags.syncs'
  AND plan_version_id IN (SELECT id FROM plan_versions WHERE plan = 'pro');

-- Enterprise: listed but never self-serve, and priced per contract rather than
-- from the catalog. It gets a row so the pricing page can render it from the
-- same source as everything else.
INSERT INTO plan_versions (
  plan, label, display_name, version, status, billable, interval,
  unit_amount_cents, included_credit_cents, tagline, features,
  listed, self_serve, sort_order, effective_from, note
) VALUES (
  'enterprise', 'Enterprise', 'Enterprise', 1, 'active', true, 'year',
  NULL, NULL,
  'Critical scale, security, and support, priced from your usage estimates.',
  '[
    "Fixed pricing from usage estimates",
    "No hard caps, ever",
    "Uptime SLA",
    "Priority support and onboarding",
    "Invoicing and procurement-friendly terms"
  ]'::jsonb,
  true, false, 30, CURRENT_DATE,
  'Contract-priced: the amount lives on each customer''s subscription, not here.'
);

INSERT INTO plan_version_meters (plan_version_id, meter, mode, included_quantity)
SELECT v.id, m.id, 'metered', 0
FROM plan_versions v CROSS JOIN meters m
WHERE v.plan = 'enterprise'
ON CONFLICT (plan_version_id, meter) DO NOTHING;

-- ---------------------------------------------------------------------------
-- organizations: point at a plan VERSION, and allow a scheduled move.
-- ---------------------------------------------------------------------------
ALTER TABLE organizations RENAME COLUMN plan_price_id TO plan_version_id;
ALTER INDEX organizations_plan_price_idx RENAME TO organizations_plan_version_idx;

-- A version change that should take effect at the next renewal rather than
-- mid-cycle.
--
-- Re-pricing someone halfway through a period they have already partly consumed
-- means their usage was accrued under terms that no longer exist by the time
-- the invoice is cut. Scheduling the move to a cycle boundary keeps each
-- period's usage priced entirely under one set of terms - which is what makes
-- "old usage against the old plan, new usage against the new one" true rather
-- than approximately true.
ALTER TABLE organizations
  ADD COLUMN pending_plan_version_id uuid REFERENCES plan_versions(id) ON DELETE SET NULL,
  ADD COLUMN pending_plan_version_at timestamptz;

-- Backfill: put every org on its plan's active version, so entitlements resolve
-- from the database immediately rather than falling back to the constants.
UPDATE organizations o
SET plan_version_id = v.id
FROM plan_versions v
WHERE v.plan = o.plan
  AND v.status = 'active'
  AND o.plan_version_id IS NULL;
