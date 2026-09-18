# Flagon

Flagon is split into two independently deployed pieces:

| Location | What | Stack | Hosting |
| --- | --- | --- | --- |
| [`app/`](app) | `app.flagon.io` - the web UI and gateway | Next.js (TypeScript) | Vercel |
| [`api/`](api) | `api.flagon.io` - the source of truth | Go (chi + [huma](https://huma.rocks)) | Fly.io |

`app` is a thin gateway: it renders the UI and forwards requests to `api`. It
never talks to Postgres or Stripe directly. `api` owns all business data and
logic, is multi-tenant via Postgres Row-Level Security (one Postgres org per
tenant, scoped by `org_id`), and is the only thing that holds real secrets
(Stripe keys, DB credentials, etc.).

## Repository layout

```
api/        Go module (github.com/flagon-io/flagon/api)
  cmd/flagon      the `flagon` CLI - `serve` runs the HTTP API, `migrate`, ...
  cmd/genspec     generates openapi/openapi.json as a build artifact
  internal/server chi router + huma API setup shared by both commands
app/        Next.js app (created with create-next-app)
openapi/    generated OpenAPI spec (gitignored, not hand-edited)
.github/    CI + dependabot configuration
```

## OpenAPI

Every endpoint registered with `huma.Register` in `api/internal/server` is
automatically documented - there is no separate step where docs can drift from
code. The only way to exclude an endpoint from the spec is to register it
directly on the chi router instead of through huma (used today for `/healthz`
and `/readyz`).

You do not need to regenerate anything to see the spec locally - the running
server serves it live:

```sh
cd api && go run ./cmd/flagon serve
# GET  http://localhost:8080/           (JSON index of the API, api.github.com style)
# GET  http://localhost:8080/openapi.json
# GET  http://localhost:8080/openapi.yaml
```

There is no built-in docs UI - the website renders its own docs viewer from the
spec above. The API only serves the raw OpenAPI (`/openapi.json`,
`/openapi.yaml`).

The root `/` returns a flat JSON map of `<name>_url` discovery links, in the
style of <https://api.github.com/>. It is built from the live OpenAPI
definition, so every endpoint registered with `huma.Register` appears there
automatically as the API grows - nothing to keep in sync by hand.

`openapi/openapi.json` is only needed outside a running process, such as
generating a typed client for `app`. Produce it with `make openapi` (the
deployed binary doesn't ship it - it serves the spec live instead).

## Local development

Postgres runs in Docker; the API and app can run either in Docker or natively.
Locally a single Postgres instance holds both databases - `flagon_api` and
`flagon_app` - to go easy on laptops. They're still separate databases, so the
data boundary matches production (which runs them as two independent instances;
see [`.docker/postgres/`](.docker/postgres) to split them back).

The base `compose.yml` binds no host ports (so it mirrors production and won't
collide with natively-run servers). Publish the ports for local work by copying
the override into place - it's gitignored, so yours is per-machine:

```sh
cp compose.override.example.yml compose.override.yml
```

`docker compose` applies `compose.override.yml` automatically. Full stack in
Docker (live-reload):

```sh
docker compose up -d --build
# api  -> http://localhost:8080  (air live-reloads on Go source changes)
# app  -> http://localhost:4000  (next dev, live-reloads on source changes)
# postgres -> localhost:5432  (databases flagon_api + flagon_app)
```

Both Dockerfiles have a `dev` target (used by compose, bind-mounts the source
tree) and a default/final target (the deployable artifact used by Fly/CI).

To run the API and/or app natively instead - handy for leaving `next dev` up
while you restart Go with a plain `go run` - comment their ports out of your
`compose.override.yml` (Postgres stays published) and start them by hand:

```sh
docker compose up -d postgres
# postgres -> localhost:5432  (databases flagon_api + flagon_app)

# API - defaults point at the compose Postgres, so no env is needed locally.
# Migrates on boot, then serves on :8080.
cd api && go run ./cmd/flagon serve

# App - reads app/.env.local automatically.
cd app && npm install && npm run dev   # http://localhost:3000
npm run db:migrate                     # one-time: BetterAuth + user_email tables
npm run db:seed                        # demo user for local login + tests
```

### Demo user (seeding)

`npm run db:seed` (run from `app/`) creates a demo account with a **static
password** and a pre-verified email, so you can log in immediately and automated
tests have stable credentials. It's idempotent - re-running resets the password
and re-verifies the email - and hashes through BetterAuth's own `hashPassword`,
so the credential is exactly what a real sign-up produces (login works by email
*or* username). Defaults:

| Field    | Value               |
| -------- | ------------------- |
| email    | `demo@flagon.dev`   |
| username | `demo`              |
| password | `password12345`     |

Override any of them with `SEED_EMAIL`, `SEED_USERNAME`, `SEED_PASSWORD`, or
`SEED_NAME`. It refuses to run with `NODE_ENV=production` unless
`SEED_ALLOW_PROD=1` is set.

### API configuration

The Go binary is the `flagon` CLI, built with [urfave/cli](https://cli.urfave.org):
`serve` runs the HTTP API, `migrate` provisions the app role and applies
migrations, and more commands will follow. Every setting is a flag with an
environment-variable source and a sane local-dev default. Precedence is **flag >
real env var > `.env.local` > `.env` > default**; the two dotfiles (next to where
you run the binary, i.e. `api/`) are gitignored and loaded on startup, so you can
persist local overrides without exporting anything. Defaults target the compose
Postgres, so the common case needs no configuration at all.

```sh
cd api
go run ./cmd/flagon --help            # list commands
go run ./cmd/flagon serve --help      # every serve flag, env var, and default
go run ./cmd/flagon migrate           # provision the app role + migrate, then exit
PORT=9000 go run ./cmd/flagon serve   # env var overrides the default (POSIX shells)
```

## Deploying

`app` and `api` deploy independently and don't care where they run: `app` is a
standard Next.js app, and `api` is a single Go binary (schema migrations are
embedded and run on boot) backed by Postgres. Wire `app` to the API with
`FLAGON_API_URL` / `FLAGON_INTERNAL_TOKEN` and give `api` a `DATABASE_URL`; how
and where you host them is up to you.

Our own instance deploys on every push to `main` via CI (`app` to Vercel, `api`
to Fly). See [`.github/workflows`](.github/workflows) for exactly what runs.
