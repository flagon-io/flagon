<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notably: `middleware.ts` is gone, replaced by `proxy.ts` (see `src/proxy.ts`). `searchParams`/`params` in pages are Promises and must be awaited. `useSearchParams` needs a `<Suspense>` boundary.
<!-- END:nextjs-agent-rules -->

# Authentication

This console owns auth for all of Flagon (BetterAuth, pinned 1.6.x). Verify every
BetterAuth import/option against the installed version before editing; subpaths
and option shapes move between releases.

- **Server**: `src/lib/auth.ts` is the configured `auth` instance + `getSession()`
  / `requireUser()`. Server-only. Mounted at `src/app/api/auth/[...all]/route.ts`.
- **Client**: `src/lib/auth-client.ts` (`authClient`). Client components import
  from here, never from `@/lib/auth`.
- **DB**: `src/db/` — the app's own drizzle client + auth schema. Tables are
  PLURAL; the `schema` object maps BetterAuth's singular model names to them.
  Migrations apply via `npm run db:migrate` and track in the `drizzle_auth`
  schema (separate from the API's pipeline, same Postgres). The `0000_auth`
  migration is HAND-WRITTEN — regenerate the schema with care.
- **Routing**: `src/app/page.tsx` routes by session/org (no org -> `/new`,
  one/active -> `/<slug>`, several -> `/select`). `/<org>` is the workspace,
  guarded by membership. `src/proxy.ts` does the optimistic signed-in/out gate.
- **Multi-email**: `user_emails` is source of truth; `users.email` mirrors the
  primary. Sign-in resolves any verified address to the primary server-side
  (`src/app/login/actions.ts`) so there is no enumeration endpoint.
- **Access tokens**: `access_tokens` is generic (personal + organization) —
  SHA-256 hashed, shown once. The API (`apps/api`) verifies them with a plain
  hash lookup and validates the session cookie via `/api/auth/get-session`, so
  it never imports BetterAuth. Feature-flag CLIENT tokens will be a SEPARATE
  table; do not fold them in here.
- **Email**: adapter in `src/lib/email/` (Resend when `RESEND_API_KEY` is set,
  else prints to the dev console). Keep copy in the house voice, no em-dashes.

Local dev needs `.env.local` (see `.env.example`) and Postgres up
(`npm run compose:up` at the repo root), then `npm run db:migrate`.
