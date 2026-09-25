# Flagon

Flagon is a self-hostable developer platform for operating your whole system,
driven from the dashboard, the API, or an AI assistant. The repo holds three
deployables:

| Location | What | Stack | Hosting |
| --- | --- | --- | --- |
| [`app/`](app) | `app.flagon.io` - the web UI and gateway | Next.js 16, React 19 (TypeScript) | Vercel |
| [`api/`](api) | `api.flagon.io` (and `mcp.flagon.io`) - the source of truth | Go (chi + [huma](https://huma.rocks)) | Fly.io |
| [`packages/ui/`](packages/ui) | `@flagon-io/ui` - the design system | React + Radix | npm workspace |

`app` is a thin gateway: it renders the UI, holds the user session, and forwards
requests to `api`. It never talks to the domain database or Stripe directly.
`api` owns all business data and logic, hosts the AI agent and the MCP server,
and is the only thing that holds real secrets (Stripe keys, DB credentials,
etc.). It is multi-tenant in a single database: every tenant-owned row carries
an `org_id`, and forced Postgres Row-Level Security scopes every runtime query to
the organizations the acting user belongs to.

[`AGENTS.md`](AGENTS.md) is the contributor guide: the architecture, the
non-negotiable principles, and the golden path for adding a capability.

## Repository layout

```
api/        Go module (github.com/flagon-io/flagon/api)
  cmd/flagon-server  the API server - `serve` runs the HTTP API (migrating on boot), `migrate` migrates
  cmd/flagon         the user-facing `flagon` CLI - a thin HTTP client (baseline skeleton)
  cmd/genspec        generates openapi/openapi.json as a build artifact
  cmd/gendocs        compiles docs/ into internal/docs/corpus.gen.json (embedded)
  cmd/genroadmap     compiles roadmap/ into internal/roadmap/roadmap.gen.json (embedded)
  cmd/genchangelog   compiles changelog/ into internal/changelog/changelog.gen.json (embedded)
  internal/server    chi router + huma API setup used by the server + genspec
  internal/ai        the agent, providers, and the shared tool registry (agent + MCP)
  internal/db        the domain data layer, migrations, and RLS
app/        Next.js app - the web UI + gateway
packages/   shared npm workspaces (packages/ui, the @flagon-io/ui design system)
docs/       Markdown/MDX documentation - the single source of truth (see docs/README.md)
roadmap/    public roadmap items, one file each (see roadmap/README.md)
changelog/  public changelog entries, one dated file each (see changelog/README.md)
openapi/    generated OpenAPI spec (gitignored, not hand-edited)
scripts/    repo maintenance scripts (relock.sh regenerates the cross-platform lockfile)
.docker/    local Postgres init scripts used by compose.yml
.github/    CI + dependabot configuration
Makefile    developer shortcuts (make help lists them)
```

The JavaScript side is an npm workspaces monorepo: the single `package-lock.json`
and `node_modules` live at the repo root, and `app` plus everything under
`packages/` are workspaces. Run `npm` commands from the root (`npm run build`,
`npm run lint`) - they delegate to the `app` workspace.

## OpenAPI

Every endpoint registered with `huma.Register` in `api/internal/server` is
automatically documented - there is no separate step where docs can drift from
code. The only way to exclude an endpoint from the spec is to register it
directly on the chi router instead of through huma (used today for `/healthz`
and `/readyz`).

You do not need to regenerate anything to see the spec locally - the running
server serves it live:

```sh
cd api && go run ./cmd/flagon-server serve
# GET  http://localhost:8080/           (JSON index of the API)
# GET  http://localhost:8080/openapi.json
# GET  http://localhost:8080/openapi.yaml
```

There is no built-in docs UI - the website renders its own docs viewer from the
spec above. The API only serves the raw OpenAPI (`/openapi.json`,
`/openapi.yaml`).

The root `/` returns a flat JSON map of `<name>_url` discovery links. It is built from the live OpenAPI
definition, so every endpoint registered with `huma.Register` appears there
automatically as the API grows - nothing to keep in sync by hand.

`openapi/openapi.json` is only needed outside a running process, such as
generating a typed client for `app`. Produce it with `make openapi` (the
deployed binary doesn't ship it - it serves the spec live instead).

## Documentation

Product documentation lives in [`docs/`](docs) as Markdown/MDX files and is the
**single source of truth**: docs ship in the same PR as the code they describe,
so a capability and its docs can't quietly drift apart. Each file carries YAML
frontmatter (`title`, plus optional `description`, `section`, `status`, `visibility`,
`order`), and its slug is the path under `docs/` without the extension
(`docs/platform/projects.mdx` -> `platform/projects`).

Nothing in `docs/` is rendered directly. `make docs` (or `go run ./cmd/gendocs`)
compiles the whole tree into `api/internal/docs/corpus.gen.json`, which the API
embeds. Everything else is a *client* of that one corpus:

- the API serves public pages at `/docs`, `/docs/search`, and `/docs/page` - the
  website renders its docs viewer entirely from these routes, holding no copy of
  its own;
- the in-product agent and the public MCP answer from the same corpus via the
  `search_docs` / `get_doc` tools.

Unlike `openapi/openapi.json` (gitignored, served live), the corpus is a
**committed** artifact: it's pulled in with `//go:embed`, so it must be checked
in for the API to build. Regenerate and commit it whenever you change anything
under `docs/` - CI runs `go run ./cmd/gendocs -check` and fails if the committed
corpus is stale. The full convention (frontmatter fields, `internal` visibility,
the corpus flow) lives in [`docs/README.md`](docs/README.md).

The public **roadmap** ([`roadmap/`](roadmap)) and **changelog**
([`changelog/`](changelog)) work exactly the same way: one Markdown file per item
or entry, compiled by `make roadmap` / `make changelog` into corpora the API
embeds and serves at `GET /roadmap` and `GET /changelog`. When a roadmap item
ships, delete it and add a changelog entry in the same change. CI runs all three
drift checks (`make docs-check roadmap-check changelog-check`), and `make check`
runs them locally along with lint and tests.

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
cd api && go run ./cmd/flagon-server serve

# App - reads app/.env.local automatically.
cd app && npm install && npm run dev   # http://localhost:3000
npm run db:migrate                     # one-time: BetterAuth + user_email tables
npm run db:seed                        # demo user for local login + tests
```

The `Makefile` wraps the common commands (`make help` lists every target):

```sh
make api        # run the API natively (go run ./cmd/flagon-server serve)
make app        # run the app natively (builds @flagon-io/ui, then next dev)
make dev        # start Postgres in Docker, then run the API and the app together
make migrate    # API migrations + the app's auth migrations (the API also migrates on boot)
make seed       # the demo user + org (needs the API running)
make test       # Go tests + design system unit tests
make lint       # go vet + eslint + @flagon-io/ui typecheck
make check      # every drift check (docs, roadmap, changelog) + lint + test
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

The server binary is `cmd/flagon-server`, built with
[urfave/cli](https://cli.urfave.org): `serve` runs the HTTP API, `migrate`
provisions the app role and applies migrations. Every setting is a flag with an
environment-variable source and a sane local-dev default. Precedence is **flag >
real env var > `.env.local` > `.env` > default**; the two dotfiles (next to where
you run the binary, i.e. `api/`) are gitignored and loaded on startup, so you can
persist local overrides without exporting anything. Defaults target the compose
Postgres, so the common case needs no configuration at all.

```sh
cd api
go run ./cmd/flagon-server --help          # list commands
go run ./cmd/flagon-server serve --help    # every serve flag, env var, and default
go run ./cmd/flagon-server migrate         # provision the app role + migrate, then exit
PORT=9000 go run ./cmd/flagon-server serve # env var overrides the default (POSIX shells)
```

The user-facing `flagon` CLI is a separate binary (`cmd/flagon`): a thin HTTP
client that operates Flagon as the authenticated user (`flagon login`,
`flagon projects`, `flagon deploy`, ...). It is a baseline skeleton today - the
command surface and flags are real, but the actions return "not implemented"
until they are wired up against the generated API client.

```sh
cd api
go run ./cmd/flagon --help                 # list the (stubbed) CLI commands
```

## Deploying

`app` and `api` deploy independently and don't care where they run: `app` is a
standard Next.js app, and `api` is a single Go binary (schema migrations are
embedded and run on boot) backed by Postgres. Wire `app` to the API with
`FLAGON_API_URL` / `FLAGON_INTERNAL_TOKEN` and give `api` a `DATABASE_URL`; how
and where you host them is up to you.

Our own instance deploys on every push to `main`: `app` to Vercel (configured by
[`vercel.json`](vercel.json)) and `api` to Fly (configured by
[`api/fly.toml`](api/fly.toml)), each through the host's Git integration rather
than a workflow in this repo - [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
runs CI only. The API applies its migrations when it boots, so there is no
separate release step; the app's auth tables migrate during the Vercel build.
