-- Platform convention: ALL ids are UUIDv7 (RFC 9562, time-ordered) unless
-- there's an explicit reason otherwise. Postgres 18 ships a native uuidv7()
-- but Neon is on 17, so until then this function provides database-side
-- generation: 48-bit unix-ms timestamp + version/variant bits over the
-- randomness of gen_random_uuid().
--
-- When the platform reaches PG18: swap the column defaults to native uuidv7()
-- and drop this function. Application-side generation lives in
-- src/lib/uuidv7.ts (BetterAuth ids, user_emails ids).
--
-- Existing rows keep their old ids (v4 / BetterAuth nanoid); only defaults
-- for NEW rows change. Rewriting primary keys is not worth the churn.

CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes = uuid_send(gen_random_uuid());
  uuid_bytes = overlay(uuid_bytes placing unix_ts_ms from 1 for 6);
  uuid_bytes = set_byte(uuid_bytes, 6, ((b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8))::int);
  uuid_bytes = set_byte(uuid_bytes, 8, ((b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8))::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE organizations ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE projects ALTER COLUMN id SET DEFAULT uuid_generate_v7();
