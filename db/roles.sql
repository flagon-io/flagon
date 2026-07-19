-- Create the restricted runtime role on a managed Postgres (e.g. Neon).
--
-- Run ONCE as your owner/admin role. The managed default role owns the tables
-- and would bypass RLS, so the app must connect as this separate NOBYPASSRLS
-- role instead. Change the password and, if needed, the database name below.

CREATE ROLE flagon_app WITH
  LOGIN
  PASSWORD 'CHANGE_ME'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- Replace "flagon" with your database name if different.
GRANT CONNECT ON DATABASE flagon TO flagon_app;
GRANT USAGE ON SCHEMA public TO flagon_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flagon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flagon_app;

-- Run this while connected as the SAME role that runs migrations (creates tables),
-- so future tables are auto-granted to flagon_app.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flagon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flagon_app;
