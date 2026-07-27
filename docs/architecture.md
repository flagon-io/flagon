# Architecture

Flagon is one API with a couple of thin visual layers on top of it.

```
apps/
  web/   Next.js marketing site      → flagon.io / www.flagon.io
  app/   Next.js product app         → app.flagon.io
  api/   Hono API, the control plane → api.flagon.io/v1/...
```

## The API is the control plane

`apps/api` owns everything that matters — projects, flags, accounts, billing,
as those land — behind versioned routes under `/v1/*`. It's the only thing
that talks to the database. Everything else is a client of it.

Locally it runs as a plain Node process (`@hono/node-server`); no external
CLI or account is required to develop against it. It also happens to deploy
cleanly to serverless platforms that support the Fetch API, since a Hono app
is just a `fetch` handler — but that's a deploy-time detail, not a local
dependency.

## Everything else is a visual layer

- `apps/web` is the public marketing site. It renders static/marketing
  content and calls `/v1/*` for the handful of things that need to be live
  (e.g. the waitlist form).
- `apps/app` is the signed-in product surface. Same rule: it renders screens
  and calls the API, it doesn't own any data itself.

Both apps read `NEXT_PUBLIC_API_URL` to know where the API lives, so the same
codebase points at `http://localhost:3002` locally and `https://api.flagon.io`
in production without any code changes.

## Local dependencies

`compose.yml` at the repo root brings up the services Flagon depends on
locally — today just Postgres. `apps/api` connects to it via `DATABASE_URL`.
