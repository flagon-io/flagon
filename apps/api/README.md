# @flagon/api

The Hono API — Flagon's control plane. See the repo root
[README](../../README.md) and [docs/architecture.md](../../docs/architecture.md)
for how this fits together.

```sh
npm run dev     # http://localhost:3002
npm run build
npm start
```

## Database

Postgres via [drizzle](https://orm.drizzle.team). Schema lives in
[src/db/schema.ts](src/db/schema.ts); migrations are generated into
[drizzle/](drizzle/).

```sh
npm run db:generate   # diff the schema -> a new SQL migration
npm run db:migrate    # apply pending migrations (as the owner role)
npm run db:studio     # browse the data
```

Locally, `docker compose up -d` (repo root) starts Postgres, then
`npm run db:migrate` creates the tables.

### Two roles, on purpose

The platform is multi-tenant with row-level security, so the API is designed
around two database roles from day one. The names are the standard
pooled/unpooled pair that managed Postgres hands you for the **owner** role;
the only thing you add by hand is the restricted app role.

- **App role — `APP_DATABASE_URL`.** What the API queries as at runtime. A
  non-owner, non-`BYPASSRLS` role (convention: `flagon_app`), so RLS is
  genuinely enforced on every query. Granted only what each table explicitly
  allows (for `leads`, just `INSERT`). This is the **pooled** endpoint. Managed
  Postgres won't create this role, so you add it. Falls back to `DATABASE_URL`
  locally, where there is only one role.
- **Owner role — `DATABASE_URL_UNPOOLED`.** Owns the schema and runs migrations
  (DDL). Never serves requests. This is the **direct** endpoint (a pooler
  breaks migration locks/transactions). Overridable with `MIGRATE_DATABASE_URL`;
  falls back to `DATABASE_URL`.

New tenant tables must enable RLS and grant the app role explicitly; a table
with no grant is unreadable by the app, which fails closed by design. `leads`
is the documented exception: a global, no-RLS capture table the marketing site
writes and internal tooling reads as the owner. Migrations grant `flagon_app`
only if that role exists, so single-role local dev is unaffected.

## Production

The API ships as a serverless `fetch` handler (`api/index.ts` serves the
compiled Hono app; the entry and routing config live in `vercel.json`).
Migrations run in the deploy **build step** via `npm run db:migrate`, so a
release applies its migrations before it serves traffic. Set `DATABASE_URL`
(pooled) and `DATABASE_URL_UNPOOLED` (direct) plus `APP_DATABASE_URL` (the
restricted role, pooled) in the deploy environment.

**`NODEJS_HELPERS=0` is required** (Vercel > Settings > Environment Variables,
every environment). Vercel's Node helpers parse the request body onto `req.body`,
which destroys the exact bytes a signature covers — with them on, every Stripe
webhook delivery fails verification. See `src/lib/vercel-request.ts`; the entry
now returns 503 rather than serving a body it cannot faithfully reproduce.
