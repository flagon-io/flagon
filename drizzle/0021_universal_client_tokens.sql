-- Publishable client tokens identify an organization for static-context OFREP.
-- They are platform-neutral and intentionally carry no browser-origin policy.
ALTER TABLE client_tokens DROP COLUMN allowed_origins;
