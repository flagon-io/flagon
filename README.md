# 🍺 Flagon

**The open-source developer platform.** Flagon starts with multitenant,
OpenFeature-native **feature flags**: target with confidence, roll out
gradually, and evaluate fast enough to sit on your hot path - and it's built to
grow into the rest of your release stack. Fully open source and self-hostable:
run the whole thing yourself, or let us own the operations so you don't have to.
Developer-first. Always.

> **License note:** Flagon is _source-available_ under
> [FSL-1.1-Apache-2.0](./LICENSE.md) (the Functional Source License). You can
> read, run, modify, and self-host it freely; you just can't ship a competing
> feature-flag service with it. Each release converts to Apache 2.0 two years
> after publication.

---

## Why Flagon

- **OpenFeature-native.** Flagon implements [OFREP](https://openfeature.dev/specification/appendix-c/)
  (the OpenFeature Remote Evaluation Protocol). Any OpenFeature SDK with the
  OFREP provider evaluates against Flagon with **zero custom code**: no
  proprietary client, no lock-in.
- **Edge-fast evaluation.** Flags compile to immutable, versioned **bundles**
  served from edge storage (Cloudflare R2 in production, Postgres locally).
  Evaluation never touches your primary database.
- **Multitenant from day one.** Organizations, ad-hoc invites, role-based
  access, and per-org SSO. Postgres **row-level security** isolates
  tenants by default; whales can be moved to dedicated infrastructure with no
  app changes.
- **Built to be split apart.** It ships today as one Next.js app, but every
  extraction seam is already in place (see below).

## Architecture

Two planes, decoupled by an immutable **bundle** boundary - the reason the hot
path stays fast and the API can later become a separate Go service without a
rewrite:

```text
 Dashboard / Management API            ┌── compile ──► Bundle store (R2 / Postgres)
 (Next.js on Vercel, owns Postgres) ───┘                      │
   • UI + marketing (SEO)                                     │ read-only, on the hot path
   • /api/v1 management (session auth)                        ▼
   • BetterAuth: orgs, invites, SSO              OFREP evaluation  (/api/ofrep/v1/*)
   • Drizzle ──► Postgres (RLS)                  • SDK-key auth (never a session)
                                                 • pure engine in src/core (Go-portable)
```

**Three seams keep extraction cheap**: never cross them with anything else:

1. **The pure engine**: [`src/core`](./src/core) imports nothing
   runtime-specific. It's the spec for evaluation semantics and ports verbatim
   to Go. [`evaluate.test.ts`](./src/core/evaluate.test.ts) is the
   cross-language conformance guard.
2. **The bundle store**: [`src/server/bundles`](./src/server/bundles) is the
   only thing both planes share. Swap the Postgres driver for R2 with one env
   var; a Go reader implements the same `get()` contract.
3. **The HTTP surfaces**: `/api/v1` (management, session auth) and
   `/api/ofrep` (evaluation, SDK-key auth) behave like independent services
   today via host routing in [`src/proxy.ts`](./src/proxy.ts). Point
   `api.flagon.io` at a Go service tomorrow and nothing else changes.

## Quickstart

### With Docker (Postgres included)

```bash
cp .env.example .env            # tweak secrets if you like
docker compose up --build       # migrates, applies RLS, serves on :3000
docker compose exec app pnpm db:seed   # demo org + flags + an SDK key
```

### Local development

```bash
pnpm install
cp .env.example .env            # point DATABASE_URL at any Postgres
pnpm db:generate                # generate the SQL migration from the schema
pnpm db:migrate                 # apply migrations + RLS policies
pnpm db:seed                    # demo data; prints an SDK key + curl
pnpm dev                        # http://localhost:3000
```

Then evaluate a flag through the standard OFREP endpoint (the seed prints a key):

```bash
curl -s -X POST http://localhost:3000/api/ofrep/v1/evaluate/flags/new-dashboard \
  -H "Authorization: Bearer $FLAGON_SDK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"context":{"targetingKey":"u1","plan":"enterprise"}}'
# => {"key":"new-dashboard","value":true,"variant":"on","reason":"TARGETING_MATCH"}
```

## Project layout

```text
src/
  core/                 pure, framework-free evaluation engine (Go-portable)
  server/
    db/                 Drizzle schema, client, migrations, RLS, seed
    auth/               BetterAuth (orgs, invites, ≥1-org-on-signup)
    bundles/            bundle store: Postgres + R2 drivers
    flags/              bundle compiler/publish + SDK keys
    ofrep/              OFREP evaluation handler
    api/                management API helpers (session + membership)
  app/
    page.tsx            marketing landing (SEO)
    app/                dashboard + auth pages (app.flagon.io)
    api/v1/             management API (api.flagon.io/v1)
    api/ofrep/v1/       OFREP evaluation (SDK-key auth)
  proxy.ts              host-based routing (Next 16's renamed middleware)
drizzle/                generated migrations + rls.sql
```

## Multitenancy

Every tenant-scoped table carries `organization_id`. [`rls.sql`](./drizzle/rls.sql)
`FORCE`s row-level security and gates access on the `app.current_org` GUC that
[`withTenant()`](./src/server/db/index.ts) sets per transaction. Auth tables
(managed by BetterAuth) and the SDK-key credential table are intentionally
excluded - the latter is the bootstrap credential the eval path resolves before
any tenant context exists.

`tenant_placements` records where each org's data lives (`shared` today;
`schema` / `dedicated` later) so large tenants can be lifted out of the shared
pool without touching application code.

## Accounts, waitlist & admin

By default **registration is open**: great for local dev and self-host. Set
`WAITLIST_ENABLED=true` (production) to switch to **invite-only**: the first
account is the **founder** (and **platform admin**); after that, only **approved**
waitlist emails may register, and everyone else joins the waitlist from the
landing page. The sign-up page and hero adapt automatically - they show the
waitlist when it's enabled and the founder slot is taken, and a normal sign-up
otherwise. The admin approves/rejects entries at `/app/admin/waitlist`; pin the
admin to a specific email with `FLAGON_ADMIN_EMAIL` (otherwise it's the founder).

**Seed login.** `pnpm db:seed` creates a demo org, flags, an SDK key, **and a
founder account**: `founder@flagon.local` / username `founder` / password
`flagon123` (also the platform admin). Sign in with email _or_ username.

People sign in with **email or username** (the BetterAuth username plugin). New
accounts land with **no organization** and are sent through onboarding to create
one, preserving the "every user ends up in ≥1 org" invariant.

All ids are **UUIDv7**: time-ordered for index locality, generated app-side
today (`src/server/db/id.ts`) and wire-compatible with Postgres 18's native
`uuidv7()` when Neon/Vercel get there.

## The API

JSON only, and self-documenting. `GET https://api.flagon.io` (or
`localhost:3000/api`) returns a flat map of named URLs you can follow; `GET /api/v1`
lists the v1 endpoints. Responses return the resource directly - **no top-level
`data` envelope**. Errors are a consistent shape: `{ "message": … }`, plus a
per-field `{ "errors": { … } }` on 422. Unknown routes 404 as JSON, never HTML.
The whole surface is described by a generated **OpenAPI** document at
`/api/openapi.json`, rendered in a built-in viewer at `/docs/api`.
Evaluation uses the OpenFeature standard (OFREP) and authenticates with SDK keys;
management uses your session. Full reference at `flagon.io/docs/api`.

## Deploying to Vercel

`vercel.json` sets the build command to [`scripts/vercel-build.mjs`](./scripts/vercel-build.mjs),
which runs `pnpm db:migrate` (migrations + RLS) **only on production deploys**
(`VERCEL_ENV=production`, i.e. pushes to `main`) and then builds. Preview deploys
skip migrations so they never mutate the production schema.

Set these in the Vercel project env: `DATABASE_URL` (Neon pooled),
`DIRECT_DATABASE_URL` (Neon **non-pooled**, used by the migrator),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the `NEXT_PUBLIC_*` URLs. For the
edge bundle read path, set `BUNDLE_STORE_DRIVER=r2` plus the `R2_*` vars.

## Testing

```bash
pnpm test          # core evaluation conformance suite (no DB required)
pnpm typecheck     # strict TypeScript
```

## Roadmap

The seams above exist precisely so these can land without rework:

- **Go data plane**: extract `/api/ofrep` to a Go service on Cloudflare
  (Containers + Wrangler) reading the same R2 bundles.
- **Billing**: Stripe plans (Free / Teams / Enterprise) with usage-based
  metering on evaluations (the BetterAuth Stripe plugin + a rollup pipeline).
- **Enterprise SSO**: per-org OIDC/SAML via the BetterAuth SSO plugin.
- **Streaming**: SSE bundle updates to SDKs.

---

Built on [OpenFeature](https://openfeature.dev). Contributions welcome under the
terms of the [license](./LICENSE.md).
