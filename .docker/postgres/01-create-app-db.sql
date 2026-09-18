-- Runs once, on first init of the local Postgres volume (it's mounted into the
-- image's /docker-entrypoint-initdb.d). POSTGRES_DB already created the API's
-- database (flagon_api); this adds the app's separate database in the same
-- instance so local dev needs only one Postgres process.
--
-- These stay two distinct databases, so the app/api data boundary is identical
-- to production - the only difference is that production runs them as two
-- independent Postgres instances. To mirror that locally, split this back into
-- two services in compose.yml (and give the app service its own instance).
CREATE DATABASE flagon_app;
