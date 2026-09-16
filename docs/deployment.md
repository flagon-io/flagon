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
5. Secrets (once real config exists, e.g. `DATABASE_URL`, `STRIPE_SECRET_KEY`)
   are set with:
   ```sh
   fly secrets set DATABASE_URL=... STRIPE_SECRET_KEY=...
   ```
   Never put these in `fly.toml` - it's committed to git.

## Deploying `app` to Vercel

The repo root `vercel.json` tells Vercel how to build the Next.js app from a
subdirectory, so the Vercel project's Root Directory should stay as the repo
root (do not set it to `app` in the dashboard, or the two will conflict).

1. Import the repo in the Vercel dashboard, or via CLI from the repo root:
   ```sh
   npx vercel link
   ```
2. Vercel will pick up `vercel.json` automatically:
   - install: `cd app && npm install`
   - build: `cd app && npm run build`
   - output: `app/.next`
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
