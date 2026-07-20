<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## The REST API is a first-class citizen

Platform resources (orgs, projects, product surfaces) ship their versioned
`/api/v1` endpoints in the SAME change as the UI (GitHub-style REST: bare
objects/arrays, snake_case JSON, flat { message, code } errors from
`src/lib/api.ts`). One shared implementation: routes and UI call the same
`src/lib/*` helpers - no drift. Every endpoint is documented in
`src/lib/openapi.ts` (served at `/api/v1/openapi.json`, browsable at
`www.flagon.io/docs/api`) in the same change; a parity test fails if routes
and spec diverge.

Account-security surfaces follow GitHub's posture instead: profile is
readable (GET /v1/user, GET /v1/user/emails) and profile fields are
PATCH-able, but credential/email MANAGEMENT (add/remove/switch-primary,
passwords, sessions) is app-only via server actions. Browser-only flows
(sign-up, sign-in, password reset, emailed verification links) are never part
of the versioned contract.

## Database naming

Tables are plural snake_case (users, sessions, user_emails, rate_limits).
BetterAuth models are mapped to these via modelName overrides in
src/lib/auth.ts - any new BetterAuth plugin table gets the same treatment
(plural modelName + hand-written migration).

## Tenancy: every table is classified, nothing is reachable by accident

The runtime role (flagon_app) is NOSUPERUSER + NOBYPASSRLS and receives NO
blanket or default privileges - a table nobody classified is UNREACHABLE by
the app (fails closed) instead of queryable without row-level security
(leaks silently). Every new table's migration must therefore:

1. `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO flagon_app;` explicitly, and
2. either `ENABLE ROW LEVEL SECURITY` with the `app.current_org_id` tenant
   policy (product data - see drizzle/0000 for the canonical shape; query it
   only through `withTenant`), or be added to AUTH_LAYER_TABLES in
   `src/db/tenancy.test.ts` with a justification (global/auth-layer data,
   access-checked in application code).

The tenancy audit (`src/db/tenancy.test.ts`) walks the live catalog and
fails on any unclassified table, missing tenant policy, default-privilege
grant, or a role that could bypass RLS. Do not weaken it; extend the
classification lists deliberately.

## IDs are UUIDv7

ALL new ids are UUIDv7 (time-ordered, RFC 9562) unless there's an explicit
reason otherwise. App-side: `uuidv7()` from `src/lib/uuidv7.ts` (also wired as
BetterAuth's generateId). DB-side defaults: `uuid_generate_v7()` from
`drizzle/0003_uuidv7.sql`. When Postgres 18 is available (Neon is on 17), swap
both for the natives. Existing rows keep their historical ids.
<!-- END:nextjs-agent-rules -->
