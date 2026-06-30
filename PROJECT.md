# Flagon - Project State & Roadmap

> Living handoff doc. Read this first to pick the project back up. It captures the
> vision, what's built, conventions, how to run it, and what's next - enough to
> resume from a cold start without losing context.

Last updated: 2026-06-30.

---

## 1. Vision

**Flagon is an open-source developer platform - the building blocks every team
ends up rebuilding, in one place.** Feature flags is the **first product**;
experiments, eventing & webhooks, configuration, and audit are on the roadmap.
(Usage metering, notifications, and standalone access management were considered
and cut from the near-term lineup.) The thesis: every team needs the same
infrastructure, so build it once (well, open source, usage-based) and stop
re-deciding the same problems.

- **Hosted offering**: we run it, usage-based pricing.
- **Open source / self-host**: single container, any Postgres. Source-available
  under **FSL-1.1-Apache-2.0** (non-compete, converts to Apache 2.0 after 2 yrs).
- Company entity: **Flagon, LLC**.
- Developer-first, always. JSON-first, self-documenting API.

---

## 2. Tech stack & key decisions

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** strict |
| Styling | **Tailwind v4** (CSS-first `@theme`, no `tailwind.config.ts`) |
| Auth | **BetterAuth** (email/username + password, organization plugin, nextCookies) |
| DB | **Postgres** (Neon in prod, Docker locally) via **Drizzle ORM** + `postgres.js` |
| IDs | **UUIDv7** (app-generated, `src/server/db/id.ts`; ready for PG18 `uuidv7()`) |
| Multitenancy | Postgres **RLS** (`FORCE`), gated on `app.current_org` GUC via `withTenant()` |
| Flag format | OpenFeature / **flagd-compatible** bundle (`src/core/types.ts`) |
| Evaluation | **OFREP** (OpenFeature Remote Evaluation Protocol) |
| Bundle store | abstraction with **Postgres** + **Cloudflare R2** drivers |
| API style | JSON only, no `data` envelope, `{ message }` errors, index, **OpenAPI 3.1** |
| Hosting (planned) | Vercel (control plane) + Cloudflare (future Go data plane) |

**Architecture - two planes, one seam.** A **control plane** (dashboard +
management API) owns the data and compiles flags into immutable, versioned
**bundles**. A **data plane** reads bundles on the hot path and never touches the
OLTP DB. Today both run in the one Next app; the bundle-store contract +
pure-engine seam mean the data plane can later be extracted to Go (Cloudflare)
with no rewrite.

**Four surfaces** (host-routed by `src/proxy.ts`; locally all on `localhost:3000`):

- `flagon.io` → **marketing** (`src/app/(marketing)`)
- `app.flagon.io` → **dashboard** (`src/app/app`)
- `sudo.flagon.io` → **internal admin console** (`src/app/sudo`), platform-admin only
- `api.flagon.io` → **API** (`src/app/api`)

**Surface isolation** (prod): the apex (`flagon.io`/`www`) serves *only* marketing.
The proxy makes `flagon.io/api/*` a hard 404, and bounces `flagon.io/app|/sudo` to
the right subdomain — the product surfaces don't exist on the apex. (No-op locally,
where everything is on one origin.)

---

## 3. Repo map

```text
src/
  core/                     pure eval engine (framework-free, Go-portable, tested)
    types.ts evaluate.ts targeting.ts hash.ts evaluate.test.ts
  server/
    db/                     schema (auth.ts, app.ts), client+withTenant, migrate, seed, id (uuidv7)
    auth/                   BetterAuth config (gating, single/multi-tenant org assignment)
    config.ts               feature flags: isWaitlistEnabled(), isMultiTenant()
    bundles/                BundleStore: postgres-store + r2-store + factory
    flags/                  publish.ts (compile+publish), sdk-keys.ts
    ofrep/                  OFREP handler
    api/                    http.ts (json/apiError/validationError/requireMembership), admin.ts
    openapi/spec.ts         OpenAPI 3.1 document (PRODUCT API only)
  app/
    (marketing)/            home, products, pricing, docs, docs/api, terms, privacy + layout
    app/                    (auth)/ {layout=redirect-if-signed-in, signin, signup, forgot/reset-password}
                            (dashboard)/ {layout=auth-gate, page=redirect→active org,
                              new + invitations (topbar-only chrome),
                              [org]/ {layout=AppShell, actions.ts (flag control-plane server actions),
                                page=overview, flags (org-wide list), members,
                                projects/ {list+create, [projectId]/ {environments + SDK keys + flags + segments,
                                  flags/[flagId] = flag editor: definition + per-env state/default/visual targeting + publish,
                                  condition-builder + targeting-builder (shared visual rule editors)}},
                                segments/ (org-wide), settings/ (org), members, invitations}}
                            settings/ (user account), invite/[id] (invite landing)
    sudo/                   internal admin: layout (AppShell, gated), page, waitlist, design
    api/                    route (index), v1/*, ofrep/v1/*, sudo/*, openapi.json, [...slug] (404), auth/[...all]
  components/               logo, theme-toggle (dropdown), marketing-nav (auth-aware)/footer,
                            openapi-viewer, auth-card, form, hero-access, waitlist-form, prose, org-switcher
  components/app/           app-shell, app-topbar, app-sidebar (grouped nav + bottom collapse), user-menu
  components/ui/            Button, Badge, Input, Textarea, Select (popover listbox), Modal (portal/focus-trap)
  lib/                      site.ts (appBase, apiBase, sudoBase, appPath/appHref, GITHUB_URL), auth-client.ts
  proxy.ts                  subdomain routing (app./sudo./api.), /api passthrough, apex surface isolation
  app/layout.tsx            root: NextTopLoader (nav progress, brand color)
drizzle/                    generated migration (0000_*.sql) + rls.sql
Dockerfile, docker-compose.yaml, vercel.json, scripts/vercel-build.mjs
LICENSE.md (FSL), LICENSE-APACHE
```

---

## 4. Conventions

- **API responses**: return the resource directly (no `data` wrapper). Errors:
  `{ "message": string }`, plus `{ "errors": { field: string[] } }` on 422
  (`validationError`). Unknown `/api/*` → JSON 404 via `app/api/[...slug]`.
  The `/api` and `/api/v1` roots are self-documenting URL maps.
- **OpenAPI**: `src/server/openapi/spec.ts` is the single source → served at
  `/api/openapi.json`, rendered by the custom viewer at `/docs/api`. **Only the
  product API is documented**: internal/platform endpoints (waitlist, sudo,
  auth) are deliberately excluded.
- **Internal vs product**: anything that's a side effect of running the hosted
  service (waitlist approvals, platform admin) lives under **`/sudo`** (UI) and
  **`/api/sudo`** (API), gated by `requirePlatformAdmin` / `isPlatformAdmin`.
  The public waitlist *join/status* stays at `/api/v1/waitlist` (used by
  marketing) but is excluded from the spec.
- **RLS**: every tenant table has `organization_id`; all tenant-scoped access
  goes through `withTenant(orgId, tx => …)`. Auth tables and `sdk_keys`
  (credential lookup) are intentionally NOT under RLS. Policies in
  `drizzle/rls.sql`, applied by `db:migrate`.
- **Design system**: reusable primitives in `src/components/ui` (`Button` +
  `buttonVariants`, `Badge`, `Input`, `Select`), built with `cva` + `cn()`
  (`src/lib/cn.ts`). Prefer these over ad-hoc Tailwind on every element; links that
  look like buttons use `buttonVariants(...)` as a className. **No native
  `<select>`** — the custom `Select` (button + popover listbox, keyboard/click-out)
  is used everywhere (invite/member roles, org switcher trigger uses `buttonVariants`)
  so app chrome matches the marketing site.
- **Routing / URLs**: dashboard routes are org-scoped under `/app/[org]/…`.
  `appPath()`/`appHref()` (`lib/site.ts`) emit `/app`-prefixed paths locally but
  **strip `/app` in prod** (when `NEXT_PUBLIC_ROOT_DOMAIN` is set the proxy re-adds
  it per subdomain), so prod URLs are clean: `app.flagon.io/<org>/members`.
- **Nav progress**: `nextjs-toploader` in the root layout shows a top progress
  bar (brand color, no spinner) on every client navigation.
- **App shell** (`components/app/`): the logged-in app and the sudo console share
  one chrome — a full-width top header (brand + org context left, **account menu
  top-right**) over a collapsible left **sidebar** whose nav is
  **grouped into labeled sections** (Overview · Feature Flags · Organization) so
  the IA scales as products are added. The sidebar **collapse toggle is pinned at
  the bottom** (state in localStorage). Future nav items show a
  muted **"Soon"** badge instead of dead links. Standalone org-agnostic pages
  (`/new`, `/invitations`) use a topbar-only variant (no sidebar). `AppSidebar`
  takes serializable `NavSection[]` (icon = string key) so layouts declare nav.
- **Knowing you're signed in**: surfaces read the session **server-side** via
  `auth.api.getSession` — never a client API call. BetterAuth cookies live on the
  apex (`.flagon.io`), shared with every subdomain, so even the marketing header
  resolves the user from the cookie and shows Dashboard + account menu. (This is
  why the apex `/api` can stay a hard 404.) Marketing's own API calls (waitlist
  join/status) therefore target the API origin via `apiBase` (api.flagon.io/v1),
  cross-origin + CORS-allowed. Tradeoff: reading the session in the marketing nav
  makes those pages dynamic — fine for now, revisit with PPR/Suspense if needed.
- **Icons**: `lucide-react` for UI icons; `@icons-pack/react-simple-icons` for
  brand logos (GitHub/Google/Apple) since lucide dropped corporate icons.
- **Loading**: use `<Skeleton>` (`src/components/skeleton.tsx`), never spinners
  or "Loading…" text.
- **Theming**: semantic tokens in `globals.css` flip via a `.dark` class. Never
  hardcode `zinc-*`. Brand is a vermilion (`--color-brand-*`). Theme
  is light/dark/**system** (dropdown in nav, no-FOUC script in root layout).
- **Logo**: standalone vermilion flagon glyph (`src/components/logo.tsx`,
  `src/app/icon.svg`), no square backplate.
- **Auth across subdomains**: when `NEXT_PUBLIC_ROOT_DOMAIN` is set, BetterAuth
  uses cross-subdomain cookies (`.flagon.io`) + trustedOrigins, so one login
  works on app./api./sudo. (`src/server/auth`).

---

## 5. Config / env flags

See `.env.example`. Notable toggles:

- `WAITLIST_ENABLED` (default `false`): OFF = open registration (local/self-host);
  ON = invite-only (founder + approved emails). UI adapts automatically.
- `MULTI_TENANCY` (default `true`): OFF = single-org mode (every user auto-joins
  one shared org `DEFAULT_ORG_SLUG`, onboarding skipped). RLS unchanged.
- `SUDO_ORG_SLUG` (default `flagon`): members of this org get the sudo console
  and can switch between it and the normal app (dogfooding). Non-members can't
  see it exists.
- `FLAGON_ADMIN_EMAIL`: bootstrap admin (sudo access before the sudo org exists).
- `BUNDLE_STORE_DRIVER`: `postgres` (default) or `r2` (+ `R2_*`).
- `NEXT_PUBLIC_SUDO_URL`: prod sudo subdomain (empty locally → `/sudo`).
- `NEXT_PUBLIC_ROOT_DOMAIN`: enables subdomain routing in prod (unset locally).

---

## 6. Accounts model

- Email **or username** sign-in (BetterAuth username plugin) + social login
  (Google/GitHub/Apple, auto-enabled when their env pair is set; see
  `/api/providers`). Signup collects email/password/username (no name field).
- **Sudo access** = membership in the sudo org (`SUDO_ORG_SLUG`, default
  `flagon`), or `FLAGON_ADMIN_EMAIL` as bootstrap.
- Signup gating: open when `WAITLIST_ENABLED=false`; else founder + approved
  waitlist emails only (enforced in `auth` `user.create.before`).
- Multi-tenant: new users have no org → onboarding `/app/new` to create one.
  Single-tenant: auto-joined to the shared org.

**Seed login** (`pnpm db:seed`): `founder@flagon.local` / username `founder` /
password `flagon123`. Also creates the sudo org `flagon` (founder is a member,
so they get sudo + dogfood Flagon's own flags), project `web`, flags
`new-dashboard` + `checkout-color`, and prints a fresh SDK key.

---

## 7. Running it

```bash
# Local (Postgres in Docker, app via your own dev server)
docker compose up -d db
cp .env.example .env
pnpm install
pnpm db:migrate     # migrations + RLS
pnpm db:seed        # founder login + demo data + SDK key
pnpm dev            # http://localhost:3000

# Reset DB
docker compose down -v && docker compose up -d db && pnpm db:migrate && pnpm db:seed

# Full self-host (single container + Postgres)
docker compose up --build

# Verify
pnpm test           # core conformance suite (no DB)
pnpm typecheck
pnpm build
```

Deploy (Vercel): `vercel.json` runs `scripts/vercel-build.mjs`, which migrates
only on **production** deploys (`VERCEL_ENV=production`) then builds. The Neon
Vercel integration provides the DB vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
…) and the migrator auto-detects the non-pooled one. Set the rest from
[`.env.production.example`](./.env.production.example): `BETTER_AUTH_*`, the
`NEXT_PUBLIC_*` URLs + `NEXT_PUBLIC_ROOT_DOMAIN`, platform toggles, and (optional)
R2 / social / Stripe.

---

## 8. Status - what's built ✅

- [x] Next 16 app, Tailwind v4 theme (light/dark/system **dropdown**), vivid-orange brand
- [x] **Design system** (`components/ui`): Button/Badge/Input/**Select** via cva + `cn`; reference at `/sudo/design`
- [x] Icons: **lucide** (UI) + **simple-icons** (brand); **skeletons** (no spinners)
- [x] Pure OFREP/flagd-compatible **evaluation engine** + conformance tests (10 passing)
- [x] Drizzle **schema** (auth + domain, 21 tables), UUIDv7 ids, **RLS** + `withTenant`
- [x] **BetterAuth**: email/username + password, **social login** (Google/GitHub/Apple, auto-enabled),
      orgs, signup gating, single/multi-tenant, **cross-subdomain cookies**
- [x] **Bundle store** (Postgres + R2) + **compile/publish** + SDK keys
- [x] **OFREP** — full API surface: single + bulk eval (HTTP-correct quoted ETag / 304) +
      **`GET /ofrep/v1/configuration`** (capability discovery → automatic SDK polling) +
      permissive CORS. Any OpenFeature SDK with the OFREP provider works unmodified.
- [x] **Management API** `/api/v1`: index, health, me, projects (list/create), environment publish
- [x] **Self-documenting API**: index, `{message}` errors, JSON 404, **OpenAPI 3.1** + viewer (product-only)
- [x] **Marketing**: home, products, pricing, **multi-page docs**, docs/api, terms, privacy; nav/footer
- [x] **Auth UI** (`/app/signin`, `/app/signup`): social buttons, adaptive waitlist/registration
- [x] **Dashboard** (`/app`): onboarding + projects view (read-only)
- [x] **Flag control plane UI** (server actions, RLS-scoped): **projects** (list/create),
      **environments** (create + colors), **SDK keys** (create/reveal-once/revoke per env),
      **flag editor** — boolean/string/number/object **variants**, per-environment
      **state + default + targeting**, **Publish** → bundle (verified end-to-end → OFREP)
- [x] **Visual targeting rule builder** (no JSON): ordered rules (first-match-wins) with a
      shared **ConditionBuilder** (ALL/ANY over attribute clauses — eq/ne/in/contains/
      gt…/semver — and **segment refs**) + **OutcomeEditor** (serve a variant or a
      **fractional rollout** w/ weights + bucketBy). Unrepresentable conditions fall back
      to a validated JSON editor so nothing is lost.
- [x] **Segments CRUD**: project-scoped reusable audiences (same ConditionBuilder in a
      modal), referenced from flag targeting; compiled into every env bundle on publish.
      Manageable both in a project workspace and org-wide at `/app/[org]/segments`
- [x] **App shell**: sidebar (full-width **org selector** header w/ logo or Flagon
      fallback) + grouped nav + bottom collapse + top-right account
      menu (full-height divider) ; shared by dashboard + sudo; auth-aware
      marketing nav (server session read, no API call); signed-in users bounced off auth pages
- [x] **Settings**: **user** (`/app/settings`: profile name/username/avatar +
      change-password via BetterAuth) and **organization** (`/app/[org]/settings`:
      name/slug/logo + owner-only delete with typed confirm)
- [x] **DB client is HMR-safe** (pooled `postgres` cached on globalThis) — fixes the
      dev connection leak that surfaced as "too many clients" / "Failed to get session"
- [x] **Design system**: `/sudo/design` (Button/Badge/Input/Field/Select/**Modal**/menus/tokens) +
      AI-friendly [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) (linked from AGENTS.md). **Modal**
      primitive (portal, focus trap, ESC/backdrop dismiss) backs all create flows
      (project / environment / flag / invite member)
- [x] **Invites**: dedicated landing page `/app/invite/[id]` — handles signed-out,
      right-account (accept/decline), and **wrong-account** (clear mismatch + switch)
      states; BetterAuth also rejects mismatched accepts server-side
- [x] **Marketing**: messaging overhauled to a build-vs-buy theme ("Build products,
      not platforms"); product lineup trimmed to Feature Flags / Experiments /
      Eventing & Webhooks / Configuration / Audit Log; **pricing** is usage-based
      (Free capped · Team $29 + usage · Enterprise custom), redesigned
- [x] **SEO/AI**: `robots.ts` (welcomes AI crawlers), `sitemap.ts`, `public/llms.txt`;
      `siteUrl` (apex) drives canonical metadata
- [x] **"What should we build next"**: real ingest — `feature_requests` table
      (migration 0001), `POST /api/v1/feature-requests`, Modal form on /products
      (best-effort emails `FLAGON_ADMIN_EMAIL`)
- [x] **Email deliverability**: `EMAIL_FROM` now the verified `@flagon.io` domain
      (was the resend.dev sandbox → spam); DMARC record documented in .env.example
- [x] **Org management**: **org-scoped routes** (`/app/[org]/…`, `/app`→active org,
      non-member slug 404s), members page (roles, remove), **invitations**
      (invite → accept → membership), pending-invite banner; clean prod URLs via `appPath`
- [x] **Nav UX**: **top progress bar** (`nextjs-toploader`); waitlist
      **dedupe messaging** (already-on-list / approved); apex **surface isolation** in proxy
- [x] **Transactional email**: provider-agnostic adapter (Resend + console fallback, `src/server/email`),
      **React Email** templates (org invite, password reset, waitlist joined/approved); wired to
      invites, password reset (+ forgot/reset pages), and waitlist join/approval
- [x] **Auth pages**: signup (helper text + terms), forgot/reset password
- [x] **Sudo** console (`/sudo`) + `/api/sudo/*`: **sudo-org-membership gated**, dogfooding switch, own subdomain
- [x] **Proxy** subdomain routing (app./sudo./api.) + central CORS + `/api` passthrough
- [x] **Docker** (migrate-on-start) + **Vercel** migrate-on-deploy; Neon-aware migrator
- [x] **Seed** (founder login + `flagon` sudo org + demo flags); FSL license; LLC entity

## 9. Path to a deployable v1 🚀

The eval loop, auth, infra, and now **flag authoring** are done. Critical path:

1. ~~Flag management UI~~ — **done**, incl. the **visual targeting rule builder**
   (condition + outcome, fractional rollout) and **Segments CRUD**. Remaining polish:
   **(a)** project / flag / environment / org **rename · delete · archive**;
   **(b)** a project/env **selector primitive** once a second product needs it;
   **(c)** a `/sudo` page to triage the **building-block requests** now being collected.
2. ~~Org context in the dashboard~~ — **done**: org-scoped routes
   (`/app/[org]/…`, clean prod URLs), switcher, members, roles, invitations
   (invite → accept → membership). Invites are link-based until email.
3. **Deploy wiring** — Vercel project + four domains (`flagon.io`, `app.`, `api.`,
   `sudo.`) + DNS exist (Cloudflare, "DNS only"). **`.env.production` is generated
   and ready to upload** (gitignored; auth secret + Resend key filled,
   `BUNDLE_STORE_DRIVER=postgres` for a zero-extra-setup first deploy). Remaining:
   set `EMAIL_FROM` + the DMARC TXT record (see `.env.example` checklist), push,
   and confirm the prod deploy migrates Neon and that subdomains + shared session +
   emails work end-to-end.
4. ~~Transactional email~~ — **done** (Resend adapter + React Email templates).
   Optional follow-ups: email **verification** on signup, and a `/sudo` email
   preview/test-send tool (use Resend test inboxes: `delivered@resend.dev`, …).

> **Pick up here next session.** Deploy is unblocked. The biggest *product* gap is
> that **pricing is marketing only — nothing enforces plans** (see §11). After
> deploy, the highest-value work is billing + entitlements (§10) and the
> rename/delete/archive polish (item 1). Also: **verify OFREP is strictly
> org-bound** (shared flag names across orgs — §11, do before real SDK traffic)
> and revisit **segment scoping** (§10).

After that it's a usable, deployable hosted product. Then:

## 10. Backlog (post-v1) 🔭

- **Billing (Stripe) — the big one, nothing exists yet.** The pricing page is
  pure marketing: there is **no Stripe integration, no plan/entitlement
  enforcement, and no usage metering**. A Free user can do everything a Team user
  can. Needed: BetterAuth Stripe plugin (checkout/portal/subscription) → an
  `entitlements` layer the management API + bundle limits read → a usage pipeline
  (eval events → `usage_rollups` → Stripe meter events). Env placeholders exist
  (`STRIPE_*`); the `subscriptions` table exists; nothing is wired.
- **Segmentation scoping (revisit).** Segments are currently project-scoped and
  rule-only (compiled into bundles in-process). Reuse across projects isn't
  possible and that feels wrong. See [docs/segmentation-design.md](./docs/segmentation-design.md)
  for the full design brief (rule vs. data-backed tiers, evaluation parity,
  expression-language tradeoff, and scoping options) before changing the model.
- **Enterprise SSO**: per-org OIDC/SAML via BetterAuth SSO plugin (`sso_providers`
  exists; plugin not enabled). SCIM later.
- **Go data plane**: move `/api/ofrep` to Go on Cloudflare reading the same R2
  bundles; port `src/core` and validate against the conformance fixtures.
- **Streaming** (SSE) bundle updates; **audit log** UI; **product detail** pages;
  **integration/e2e tests** (RLS isolation, publish→eval, auth/onboarding).

## 11. Known gaps / caveats ⚠️

- **No billing / plan enforcement.** Pricing is marketing only. Nothing charges,
  meters, or gates by plan. Don't launch paid tiers until §10 "Billing" is built.
- **Verify OFREP is strictly org-bound (do before real SDK traffic).** Concern:
  two orgs can have the same flag key (e.g. both `new-dashboard`); make sure one
  org's SDK key can never read another's. How it's bound today: eval resolves the
  SDK key → `{org, env}` (`resolveSdkKey`, uses the plain `db` since `sdk_keys` is
  non-RLS by design), then `PostgresBundleStore.get()` runs inside
  `withTenant(org)`, so the `bundles` RLS policy (FORCE RLS, gated on
  `app.current_org`) plus the `environmentId` WHERE scope the read to exactly
  `(org, env)`. Env IDs are globally-unique UUIDv7, and flag keys are unique per
  project, so within a bundle there's no collision. This *should* be airtight.
  **To confirm + harden tomorrow:** (1) add an integration test — two orgs, same
  flag key, distinct SDK keys → each key resolves only its own value and org A's
  key never sees org B's flag (single + bulk OFREP); (2) `get()`/`put()` filter by
  `environmentId` only and lean on RLS for the org filter — add an explicit
  `organizationId` predicate to the WHERE for defense-in-depth and clarity;
  (3) sanity-check the same for the R2 bundle store key (`bundles/<org>/<env>` vs
  `<env>` only). Files: `src/server/ofrep/handler.ts`,
  `src/server/flags/sdk-keys.ts`, `src/server/bundles/{postgres,r2}-store.ts`.
- **Legal pages** are solid baseline copy — **have counsel review** before launch.
- **Production subdomain routing + cross-subdomain auth** are implemented but only
  exercised locally (proxy is a no-op without `NEXT_PUBLIC_ROOT_DOMAIN`); validate
  on the real multi-subdomain deploy.
- **Neon is provisioned** via the Vercel integration but **not yet migrated/deployed**;
  the live DB is still local Docker. First production deploy runs migrations.
- Migrations: `0000_*.sql` (baseline) + `0001_*.sql` (feature_requests). Additive;
  applied on deploy. Locally run `pnpm db:migrate` (if Postgres reports too many
  connections, `docker compose restart db` first).
