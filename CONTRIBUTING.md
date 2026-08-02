# Contributing to Flagon

Thanks for your interest in Flagon. This guide covers local setup and the
conventions we follow.

## Repository layout

```
apps/
  web/   Next.js marketing site + docs → flagon.io
  app/   Next.js product console        → app.flagon.io
  api/   Hono API, the control plane    → api.flagon.io/v1/...
packages/
  design/  @flagon/design, the shared UI + design system every app renders from
```

## Local development

Prerequisites: **Node 24 or newer** (the repo pins `engines` to `>=24.0.0`) and
Docker (for local Postgres).

```sh
npm install
cp .env.example .env
npm run compose:up     # start local dependencies (Postgres)
npm run dev            # web :3000, app :3001, api :3002
```

Copy each app's env example (`.env` for `apps/api`, `.env.local` for the Next
apps) and adjust as needed, then apply migrations:

```sh
npm run db:migrate -w apps/api
npm run db:migrate -w apps/app
```

Stop local dependencies with `npm run compose:down`.

## Tests, lint, and build

```sh
npm test          # Vitest: unit + DB-backed integration and tenancy suites
npm run lint      # ESLint across workspaces; the API also runs `tsc --noEmit`
npm run build     # production build (the Next apps are typechecked here)
```

The Next apps (`app`, `web`) are **not** typechecked by `npm run lint` (it's
ESLint-only for them); their types are checked by `npm run build`, or run
`npx tsc --noEmit` inside the app directory.

The integration and tenancy suites run against Postgres as a restricted,
row-level-security-enforcing role, so they need `npm run compose:up` and the API
env loaded (`apps/api/.env`). Tests without a database are skipped.

## Conventions

- **API-first parity.** Every product mutation ships its `/v1` endpoint, its
  OpenAPI registration, and its docs together. There are no UI-only writes.
- **Use the design system.** Build UI from `@flagon/design`; add a missing
  primitive there rather than hand-rolling a one-off with raw utility classes.
- **Migrations are hand-written** SQL under `apps/*/drizzle`, each with a matching
  `_journal.json` entry. Keep the schema and the migration in sync.
- **Copy style.** No em-dashes in product/UI copy or docs; write in the house
  voice.
- Match the style of the surrounding code.

## Pull requests

- Branch off `main`, keep changes focused, and describe what changed and why.
- Run `npm run lint`, `npm test`, and `npm run build` before opening a PR
  (`build` is what typechecks the Next apps).
- For security issues, do **not** open a public issue or PR. See
  [SECURITY.md](SECURITY.md).

## License

Flagon is source-available under the Functional Source License (FSL 1.1). By
contributing, you agree that your contributions are licensed under the same
terms. See [LICENSE](LICENSE).
