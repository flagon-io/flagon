# Deploying Flagon

Flagon deploys as two independent services from this one repo: `app` to
Vercel, `api` to Fly.io. Neither deploy depends on the other completing first,
but `api` should exist before you point DNS at it so `app`'s server-side calls
have somewhere to go.

## Prerequisites

- A Vercel account with the `flagon-io` team/org set up.
- A Fly.io account with `flyctl` installed and authenticated (`fly auth login`).
- `flagon.io` DNS managed somewhere you can add records (Vercel and Fly both
  need a CNAME/A record per app).

## Deploying `api` to Fly

1. From the repo root:
   ```sh
   cd api
   fly launch --no-deploy --copy-config
   ```
   This reads the committed `fly.toml` (app name `flagon-api`, region `iad`,
   health check on `/healthz`). Choose "no" if asked to overwrite `fly.toml`.
2. Deploy:
   ```sh
   fly deploy
   ```
   Fly builds `api/Dockerfile` (multi-stage Go build, distroless runtime) and
   ships it. The container listens on `:8080` internally; Fly's
   `http_service` config handles TLS/routing.
3. Point `api.flagon.io` at the app:
   ```sh
   fly certs add api.flagon.io
   ```
   then add the DNS records `fly certs add` prints out (typically an A/AAAA
   pair or CNAME to `<app>.fly.dev`).
4. Verify:
   ```sh
   curl https://api.flagon.io/healthz
   curl https://api.flagon.io/openapi.json
   ```
5. Secrets (e.g. `STRIPE_SECRET_KEY`) are set with:
   ```sh
   fly secrets set STRIPE_SECRET_KEY=...
   ```
   Never put these in `fly.toml` - it's committed to git.

### Database, roles, and migrations

The API uses two Postgres roles so the running server can never hold schema
power (see also `api/internal/db`):

- **Migrator** (`DATABASE_URL`) - the schema owner. Attaching a Fly Managed
  Postgres cluster sets this automatically. It is used ONLY at boot, to run
  migrations and to provision the app role. The HTTP server never queries with
  it.
- **App / RLS role** (`FLAGON_APP_DATABASE_URL`) - a least-privilege,
  `NOBYPASSRLS` login used for every runtime query. Because it cannot bypass
  row-level security, tenant isolation holds even if a query forgets to scope
  itself.

Point `FLAGON_APP_DATABASE_URL` at the same cluster/database as `DATABASE_URL`,
but with the app role's own credentials. The API **provisions the role for
you** at boot (creates it if missing, pins its password to this URL, and
strips superuser/createdb/createrole/bypassrls), so the credential lives in
exactly one place - this secret:

```sh
# Same host/db as DATABASE_URL, different user + password.
fly secrets set FLAGON_APP_DATABASE_URL='postgres://flagon_app:<generated-pw>@<same-host>:5432/<same-db>'
```

Generate a strong password for `<generated-pw>` (e.g. `openssl rand -hex 24`).
Use the same host/port/database as the migrator URL; only the user and password
differ.

**Migrations run automatically on every boot** (embedded SQL in
`api/internal/db/migrations`, applied in filename order, each in its own
transaction). Because `push to main` redeploys the API, migrations ship with
the code - there is no separate migrate step. The boot contract:

- A reachable database with a **failing or modified** migration is **fatal**:
  the process exits non-zero, so Fly fails the deploy and keeps the old
  machine. A schema mismatch never ships.
- An **unreachable** database is **not** fatal: the API starts anyway (locally
  and in production) so a database blip can't take the deploy down. It logs a
  loud `WARNING` and `/readyz` returns `503` with the reason until the database
  comes back. `/healthz` (Fly's health check) stays green because it is
  liveness-only. If the database was down at boot, redeploy/restart once it is
  back so the app role gets provisioned.

Migrations are immutable once applied: editing a shipped migration file trips a
checksum check and fails the next boot. Add a new migration instead.

## Deploying `app` to Vercel

Set the Vercel project's **Root Directory to `app`** (Project Settings ->
General -> Root Directory). With that set, Vercel auto-detects Next.js and
needs no `vercel.json` or custom build/install commands - don't add one back;
a root-level `vercel.json` with its own `cd app && ...` commands conflicts
with Root Directory (Vercel already `cd`s into `app/` for you, so the
commands try to `cd app` a second time and fail with "No such file or
directory").

1. Import the repo in the Vercel dashboard, or via CLI from the repo root:
   ```sh
   npx vercel link
   ```
2. In Project Settings, set Root Directory to `app`. Leave Build/Install/
   Output commands on their framework defaults (Next.js auto-detected).
3. Set the production domain to `app.flagon.io` in the project's Domains
   settings, and add the DNS record Vercel gives you (usually a CNAME to
   `cname.vercel-dns.com`).
4. Environment variables (once BetterAuth/Stripe config exists) are set in
   the Vercel project settings per-environment (Production/Preview/Dev), not
   committed to git. At minimum, `app` needs `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL` (`https://app.flagon.io` in production), and
   `DATABASE_URL` for login/signup to actually work - see `app/.env.example`.
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and
   `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are optional; the social sign-in
   buttons stay visible but disabled until those are set.
5. Once `DATABASE_URL` points at a real Postgres (this is `app`'s OWN
   database - it must not be the same Postgres instance/database as `api`'s),
   run the migrations once (from `app/`, with `.env.local` pointed at that
   database):
   ```sh
   npm run db:migrate
   ```
   This runs BetterAuth's own migration (`user`, `session`, `account`,
   `verification` tables) followed by the custom `user_email` table migration
   that backs multiple email addresses per account. Re-run it any time auth
   plugins or `app/db/migrations/*.sql` change.
6. Deploy:
   ```sh
   npx vercel --prod
   ```
   or just push to `main` - once the project is linked, Vercel deploys on
   every push automatically.

## CI

`.github/workflows/ci.yml` builds/vets/tests `api` and lints/builds `app` on
every push and pull request. Treat a green CI run as the bar for deploying
either service.
