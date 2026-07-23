-- The price book: what each plan costs, as versioned data.
--
-- Until now the Pro price was an ENVIRONMENT VARIABLE holding a Stripe id
-- (STRIPE_PRO_PRICE_ID), with a lookup_key search and a sandbox auto-create
-- behind it (src/lib/billing.ts). Three things are wrong with that, and all
-- three are the same thing: an env var is not a record.
--
--   It cannot be versioned. Raising Pro to $25 means editing the variable, at
--   which point the old price still exists in Stripe with live subscriptions
--   on it, and nothing in this system knows that or which orgs are on it.
--
--   It cannot be audited. "Who is still on 2024 pricing?" is a question about
--   our customers that could only be answered by paging Stripe and joining by
--   hand, and the answer would not be reproducible.
--
--   It cannot carry what the price INCLUDES. The $20 and the "$20 of included
--   usage" it buys were declared in two unrelated places (the env var and
--   PLANS[plan].includedUsageCents), so re-pricing moved one and silently left
--   the other. A price and its entitlements are one fact and belong in one row.
--
-- This table is that row. Each version of each plan's price is a record: the
-- amount, the Stripe price it maps to, and the usage credit + per-meter
-- allowances that amount buys. Superseding a price flips the old row to
-- 'legacy' and inserts a new 'active' one; the legacy row stays readable
-- FOREVER, because organizations still point at it and their entitlements are
-- resolved from it.
--
-- Grandfathering therefore costs nothing and is the DEFAULT behaviour: an org
-- keeps the price row it subscribed on until something deliberately moves it.
--
-- GLOBAL, no RLS. This is the catalog, not tenant data - every org reads the
-- same rows, and the pricing page renders from them. Written by the operator
-- console (sudo) as the owner; the app role only ever reads.

CREATE TABLE plan_prices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Which plan this is a price FOR. Not a foreign key: plans are code
  -- (src/lib/plans.ts), because their entitlement SEMANTICS are code.
  plan text NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),

  -- The Stripe price this maps to, for self-serve Checkout. NULL is normal and
  -- expected: Hobby has no Stripe price, and every enterprise/custom deal is
  -- priced inline on its own subscription (price_data) rather than from the
  -- catalog. Only a self-serve plan needs a shared, reusable Stripe price.
  stripe_price_id text UNIQUE,

  -- What an operator calls this version. Shown in the console and in the
  -- "who is on legacy pricing" report, so make it human: "Pro 2026", not a
  -- uuid the reader has to resolve.
  label text NOT NULL,

  -- The recurring amount, in cents, per `interval`. 0 is valid (Hobby, and a
  -- fully-covered dogfood contract).
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),

  -- What the amount BUYS, travelling with the amount rather than beside it.
  --
  -- Pro's promise is that the fee comes back as usage, so for a self-serve
  -- price this equals unit_amount_cents. It is stored rather than derived
  -- because that equality is a PRICING DECISION, not an invariant: a future
  -- plan may deliberately include less than it charges, and a past one must
  -- keep including whatever it included when it was sold.
  included_credit_cents integer NOT NULL DEFAULT 0
    CHECK (included_credit_cents >= 0),

  -- Units of a meter this price grants before PRICING starts, e.g.
  --   {"flags.syncs": 50000000}
  -- Same shape and meaning as PLANS[plan].meterAllowances, which this
  -- supersedes per-price. Empty means "fall back to the plan constant", so an
  -- existing plan behaves exactly as it did before this table existed.
  meter_allowances jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Units a meter may consume before requests are REFUSED, e.g.
  --   {"flags.syncs": 5000000}
  -- Only Hobby caps anything. Empty means uncapped (Pro/Enterprise) or,
  -- for a plan whose constant declares caps, fall back to that constant.
  hard_caps jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- active -> the price NEW subscriptions are sold at; at most one per
  --           (plan, interval).
  -- legacy -> superseded, but still in force for every org pointing at it.
  --           Never delete one of these: an org's entitlements resolve
  --           through it, and deleting it would silently re-price a customer.
  -- draft  -> staged, not yet sellable. Lets a price be reviewed in the
  --           console before it can reach a customer.
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('active', 'legacy', 'draft')),

  -- When this version started being sold. Informational, for the report.
  effective_from date,

  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one sellable price per plan per interval. Partial, so superseding is
-- flip-then-insert with no window in which two prices are both "the" price,
-- and so any number of legacy/draft rows can coexist alongside it.
CREATE UNIQUE INDEX plan_prices_one_active_idx
  ON plan_prices (plan, interval)
  WHERE status = 'active';

-- The version history for one plan, newest first.
CREATE INDEX plan_prices_plan_idx ON plan_prices (plan, created_at DESC);

-- The price an organization is actually on.
--
-- This is the column that makes "who is on legacy pricing?" a plain join
-- instead of a Stripe reconciliation. NULL means the org predates the price
-- book (or is on Hobby with nothing to point at), and entitlements fall back
-- to the plan constants exactly as they did before - so this migration changes
-- no org's bill on the day it runs.
--
-- ON DELETE RESTRICT, deliberately: a price with customers on it must not be
-- deletable. The status column is how a price is retired.
ALTER TABLE organizations
  ADD COLUMN plan_price_id uuid REFERENCES plan_prices(id) ON DELETE RESTRICT;

CREATE INDEX organizations_plan_price_idx ON organizations (plan_price_id);

-- Catalog data: global, readable by the app role, written by the owner.
GRANT SELECT ON plan_prices TO flagon_app;

-- Seed the plans as they are TODAY, so the price book starts out agreeing with
-- the constants it supersedes rather than contradicting them. The numbers here
-- are copied from src/lib/plans.ts; if they drift, the constants remain the
-- published defaults and these rows are what customers are actually on.
--
-- stripe_price_id is left NULL: the live Pro price id differs per deployment
-- (and per Stripe account/mode), so it is linked from the operator console
-- rather than guessed by a migration. Until it is linked, Checkout falls back
-- to the previous env/lookup_key resolution.
INSERT INTO plan_prices (
  plan, label, unit_amount_cents, interval,
  included_credit_cents, meter_allowances, hard_caps,
  status, effective_from, note
) VALUES
  (
    'free', 'Hobby', 0, 'month',
    1000,
    '{"flags.syncs": 5000000}'::jsonb,
    '{"flags.syncs": 5000000}'::jsonb,
    'active', CURRENT_DATE,
    'Seeded from PLANS.free at the time the price book was introduced.'
  ),
  (
    'pro', 'Pro', 2000, 'month',
    2000,
    '{"flags.syncs": 50000000}'::jsonb,
    '{}'::jsonb,
    'active', CURRENT_DATE,
    'Seeded from PLANS.pro. Link stripe_price_id in the operator console.'
  );

-- Enterprise gets no seeded row on purpose: it has no catalog price. Every
-- enterprise subscription is priced inline from its contract, and its
-- entitlements come from org_contracts + org_entitlements (0036).
