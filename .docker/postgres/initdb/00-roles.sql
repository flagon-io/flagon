-- Runs once, as the database owner (flagon_owner), on first cluster init.
--
-- Creates the RESTRICTED runtime role the application connects as. It is NOT a
-- superuser, does NOT own the tables, and critically has NOBYPASSRLS, so every
-- tenant table's row-level security is always enforced against it.
--
-- On Neon (or any managed Postgres) run the equivalent of this file once as your
-- owner role, since the default managed role owns tables and would otherwise
-- bypass RLS. See db/roles.sql.

CREATE ROLE flagon_app WITH
  LOGIN
  PASSWORD 'flagon_app'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

GRANT CONNECT ON DATABASE flagon TO flagon_app;
GRANT USAGE ON SCHEMA public TO flagon_app;

-- NO table grants and NO default privileges here, deliberately. Every
-- migration GRANTs the app role access to its tables explicitly, alongside
-- the table's row-level security policy (or its auth-layer classification in
-- src/db/tenancy.test.ts). A table nobody classified is unreachable by the
-- app - it fails closed instead of leaking across tenants.
