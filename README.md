# Flagon

A self-hostable developer platform. Its products sit on shared substrate,
accounts and organizations, multi-tenant Postgres with row-level security, an
API-first control plane, and usage metering, so each one behaves the same way.

Feature flags are available today: OpenFeature-native and evaluated over
[OFREP](https://openfeature.dev/specification/appendix-c/), with targeting
rules, reusable segments, percentage splits, and scheduled progressive rollouts.
Any OpenFeature SDK can point at the API and evaluate flags with no custom glue.

```
apps/
  web/   Next.js marketing site + docs → flagon.io, flagon.io/docs
  app/   Next.js product app           → app.flagon.io    (invite-only for now)
  api/   Hono API, the control plane   → api.flagon.io/v1/...
packages/
  design/  @flagon/design, the shared UI + design system every app renders from
```

The Next.js apps are plain visual layers. They render screens and call the API
under `/v1/*`; nothing else talks to a database directly. Every mutation ships
its API endpoint, OpenAPI spec, and docs in lockstep, so there are no UI-only
writes. The documentation lives inside the marketing site at `/docs` (MDX on the
same design system). See [docs/architecture.md](docs/architecture.md) for more.

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

## Test, lint, and build

```sh
npm test          # Vitest: unit + DB-backed integration and tenancy suites
npm run lint      # lint + typecheck every workspace
npm run build     # production build of all apps
```

The integration and tenancy tests run against Postgres as a restricted,
row-level-security-enforcing role, so tenancy is actually exercised rather than
bypassed. They need `npm run compose:up` first and the API env loaded
(`apps/api/.env`); tests without a database are skipped. OFREP is covered end to
end, including a real OpenFeature SDK evaluating against a served instance.

## Storybook

The design-system primitives and the flag/targeting editors have stories for
isolated visual review:

```sh
npm run storybook -w apps/app   # http://localhost:6006
```
