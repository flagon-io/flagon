# Console QA screenshots

A tiny harness for reviewing the auth-gated console visually — it logs in as a
stable QA user and writes full-page screenshots of real routes to `qa/shots/`
(gitignored). Useful for eyeballing a UI change, and for an agent to actually
*see* what it built instead of guessing.

## Prerequisites

- The dev server running (`npm run dev` at the repo root, console on `:3001`).
  The harness never starts, stops, or restarts it.
- **Chrome (or another Chromium channel) installed on the machine.** We use
  `playwright-core` with `channel: "chrome"`, so there is no browser to
  download — it drives the Chrome you already have.
- A seeded org to view (default `flagon`) with an experiment + flag to render:
  `cd apps/api && npm run seed:experiments`.

## Run

```bash
cd apps/app
npm run qa                          # default route set → qa/shots/*.png
npm run qa -- /flagon/flags         # just these paths instead
QA_ORG_SLUG=acme npm run qa         # a different org
```

First run signs up a stable QA user (`qa+screenshot@flagon.test`) through the
real auth API and grants it admin on the target org. That grant is idempotent,
so subsequent runs are instant and need no cleanup.

## What it captures

Edit [`routes.mjs`](./routes.mjs) — one `{ name, path }` per shot. `:slug`,
`:exp`, and `:flag` are substituted from env. Add a line, get a screenshot.

## Configuration (all optional)

| env | default | meaning |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3001` | console base URL |
| `QA_ORG_SLUG` | `flagon` | org slug to view |
| `QA_EXP` / `QA_FLAG` | seeded keys | experiment / flag to open |
| `QA_EMAIL` / `QA_PASSWORD` / `QA_NAME` | `qa+screenshot@flagon.test` … | the QA user |
| `QA_OUT` | `qa/shots` | output directory |
| `CHROME_CHANNEL` | `chrome` | `chrome`, `msedge`, `chrome-beta`, … |

## Safety

The harness inserts a membership row, so it **refuses to run against a database
that looks remote/production** (Neon, RDS, Supabase, `sslmode=require`). It reads
`APP_DATABASE_URL` / `DATABASE_URL` from `.env.local`. Override the guard only if
you are certain, with `QA_ALLOW_REMOTE_DB=1`.
