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

-- DML on existing objects...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flagon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flagon_app;

-- ...and on anything the owner creates later (migrations run as flagon_owner).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flagon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flagon_app;
