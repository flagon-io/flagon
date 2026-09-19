-- Org security policy. The first knob: an org can REQUIRE that its members have
-- two-factor authentication enabled. 2FA itself is owned by the app's auth layer
-- (BetterAuth), so the app gate does the actual "is this user's 2FA on?" check;
-- this column is the org-level POLICY the gate reads. Default off (opt-in), same
-- shape as audit_ip_disclosure (0020).
--
-- require_sso (added later, alongside the SSO providers) will live beside this.
ALTER TABLE public.orgs
	ADD COLUMN enforce_two_factor boolean NOT NULL DEFAULT false;
