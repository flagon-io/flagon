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
  cmd/api        entrypoint - runs the HTTP server
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
cd api && go run ./cmd/api
# GET  http://localhost:8080/openapi.json
# GET  http://localhost:8080/openapi.yaml
# GET  http://localhost:8080/docs      (interactive UI)
```

`openapi/openapi.json` is only produced as a build artifact (see
`api/Dockerfile`) for cases outside a running process, such as generating a
typed client for `app`. Regenerate it manually with `make openapi` if you need
a local copy.

## Local development

Either run things natively, or use Docker Compose for the full stack
(separate Postgres per service, mirroring production, with live-reload):

```sh
docker compose up -d --build
# api  -> http://localhost:8080  (air live-reloads on Go source changes)
# app  -> http://localhost:4000  (next dev, live-reloads on source changes)
# postgres-api -> localhost:5432, postgres-app -> localhost:5433
```

Both Dockerfiles have a `dev` target (used by compose, bind-mounts the source
tree) and a default/final target (the deployable artifact used by Fly/CI).

Running natively instead:

```sh
# API
cd api && go run ./cmd/api        # http://localhost:8080

# App
cd app && npm install && npm run dev   # http://localhost:3000
npm run db:migrate                     # one-time: BetterAuth + user_email tables
```

## Deploying

See [`docs/deployment.md`](docs/deployment.md) for step-by-step instructions
to deploy `app` to Vercel and `api` to Fly.
