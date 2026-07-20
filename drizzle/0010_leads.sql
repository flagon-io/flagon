-- Sales leads (the contact-sales form). Deliberately a plain table, not a
-- public API resource: a separate internal tool consumes it later (status is
-- its workflow column). Global, no RLS - written by the marketing surface,
-- read by internal tooling as the owner.

CREATE TABLE leads (
  id uuid PRIMARY KEY,
  kind text NOT NULL DEFAULT 'enterprise',
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  company_size text,
  message text,
  source text,
  ip text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_status_idx ON leads (status);
CREATE INDEX leads_created_at_idx ON leads (created_at);
-- Throttling lookups (max N submissions per IP per window).
CREATE INDEX leads_ip_created_at_idx ON leads (ip, created_at);
