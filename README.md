# Flagon

The self-hostable developer platform.

```
apps/
  web/   Next.js marketing site + docs → flagon.io, flagon.io/docs
  app/   Next.js product app           → app.flagon.io    (invite-only for now)
  api/   Hono API, the control plane   → api.flagon.io/v1/...
```

The Next.js apps are plain visual layers — they render screens and call the
API under `/v1/*`. Nothing else talks to a database directly. The documentation
lives inside the marketing site at `/docs` (MDX on the same design system). See
[docs/architecture.md](docs/architecture.md) for more.

Task running is orchestrated with [Turborepo](https://turbo.build/), and
local dependencies (Postgres, for now) run via `docker compose`.

## Develop

```sh
npm install

# start local dependencies (Postgres) in the background
cp .env.example .env
npm run compose:up

# run everything at once (turbo, one process per app)
npm run dev

# or run just one app
npm run dev:web   # http://localhost:3000
npm run dev:app   # http://localhost:3001
npm run dev:api   # http://localhost:3002
```

Copy each app's `.env.example` to `.env.local` (`.env` for `apps/api`) and
adjust as needed. `apps/api/.env.example` already points `DATABASE_URL` at
the `compose.yml` Postgres instance.

Stop local dependencies with `npm run compose:down`.

