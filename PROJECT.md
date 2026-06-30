# Flagon - Project State & Roadmap

> Living handoff doc. Read this first to pick the project back up. It captures the
> vision, what's built, conventions, how to run it, and what's next - enough to
> resume from a cold start without losing context.

Last updated: 2026-06-30 (mobile pass, OFREP org-binding tests, sudo requests triage,
project-count fix, environment auto-seed).

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
  goes through `withTenant(orgId, tx => …)`. Auth tables, `sdk_keys`, `api_tokens`
  (credential lookup), and `jwkss` are intentionally NOT under RLS. Policies in
  `drizzle/rls.sql`, applied by `db:migrate`.
- **API auth — one Principal, a JWT seam**: the management API (`/api/v1`)
  authenticates via `getPrincipal` (`src/server/api/http.ts`), which normalizes a
  session cookie, a **user PAT** (`flagon_pat_…`), an **org token** (`flagon_oat_…`),
  or a Bearer **JWT** into one `Principal` (`src/server/auth/principal.ts`). Tokens
  are roll-our-own (mirror `sdk-keys.ts`): SHA-256 hash, reveal-once, `api_tokens`
  (non-RLS). A PAT inherits the user's **live** org roles; an org token carries a
  fixed role in one org (capped at the creator's role, admin+ to manage). `POST
  /api/v1/token` exchanges any credential for a 15-min JWT (BetterAuth `jwt` plugin
  signs; JWKS published); `verifyJwt` (`src/server/auth/jwt.ts`, jose) validates it
  with **no session/PAT logic** — that's exactly what a future split-out API/data
  plane uses. `principalClaims()` is the single source for both the session
  `definePayload` and the exchange, so resolver and mint never diverge. Tokens may
  be **scope-restricted** (`src/server/api/scopes.ts`; endpoints declare a required
  scope) and are **rate-limited per token** (`src/server/api/rate-limit.ts`, 429 +
  `Retry-After`); the JWKS signing key **rotates** (90d, 7d grace). OFREP/SDK-key
  evaluation is a separate path and is unaffected. Docs: `/docs/api-authentication`.
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
- **Logo**: monoline flagon mark — single constant-width stroke (lidded jug,
  knob, pour spout, handle), **flat one color** via `currentColor`, no gradient
  (defaults to brand vermilion; print/merch-safe). `src/components/logo.tsx`
  (`LogoMark`/`Logo`) + `src/app/icon.svg` (favicon). Marketing OG/Twitter images
  are dynamic `next/og` (`src/app/_og/render.tsx`, Geist base64-embedded in
  `src/app/_og/fonts.ts`): per-page branded cards (grid + glow + watermark).
- **Auth across subdomains**: when `NEXT_PUBLIC_ROOT_DOMAIN` is set, BetterAuth
  uses cross-subdomain cookies (`.flagon.io`) + trustedOrigins, so one login
  works on app./api./sudo. (`src/server/auth`).
- **Mobile**: every surface is responsive. App/sudo shells swap the sidebar for a
  `MobileNav` drawer below `md` (org switcher included); marketing nav uses
  `MarketingMobileMenu`. Data tables wrap in `overflow-x-auto` + a `min-w-*`; dense
  rule rows (`targeting`/`fractional`) use `flex-wrap`. Modals focus the first field
  and right-align footer actions (primary rightmost) — see DESIGN_SYSTEM.md.
- **Drizzle gotcha (correlated subqueries)**: interpolating a column into a raw
  `sql` template subquery (e.g. `${projects.id}`) renders it **unqualified** (`"id"`), which
  inside a subquery binds to the inner table's own column, silently returning 0.
  Write the qualified ref as literal text (`projects.id`). This bit the projects
  list env/flag counts; fixed + commented in `[org]/projects/page.tsx`.
- **Tests**: Vitest (`pnpm test`). `vitest.config.ts` maps the `@/*` alias to `./src`
  so tests can import by app path. Coverage: core eval conformance
  (`src/core/evaluate.test.ts`) + OFREP org-binding (`src/server/ofrep/handler.test.ts`).

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
- **API credentials**: users mint **personal access tokens** (Settings → Personal
  access tokens; inherit their live permissions) and admins mint **org tokens**
  (Org settings → Organization API tokens; fixed role, no shared service account).
  Both are reveal-once and revocable. See the §4 "API auth — one Principal, a JWT
  seam" bullet for how they resolve and exchange for a JWT.
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
      **Org-binding regression-tested** (`handler.test.ts`): shared flag keys stay
      strictly tenant-isolated; cross-org reads are impossible at the handler seam.
- [x] **Management API** `/api/v1`: index, health, me, projects (list/create), environment publish,
      **token exchange** (`POST /v1/token`)
- [x] **API tokens + JWT seam**: user **PATs** + org-provisioned tokens (roll-our-own,
      hashed, reveal-once, `api_tokens`, non-RLS), a unified `getPrincipal` resolver
      (session · PAT · org token · JWT), and a `verifyJwt` (jose/JWKS) seam so a future
      split-out API validates JWT only. **Fine-grained scopes**, **per-token rate
      limiting** (429), and **JWKS rotation** (90d). Settings UIs for both; docs at
      `/docs/api-authentication`. Verified end-to-end (PAT→/me, exchange→JWT→claims-
      authz, org-token cross-org 403, revoke→401, scope→403, rate-limit→429, **OFREP
      eval still 200**)
- [x] **Self-documenting API**: index, `{message}` errors, JSON 404, **OpenAPI 3.1** + viewer (product-only)
- [x] **Marketing**: home, products, pricing, **multi-page docs**, docs/api, terms, privacy; nav/footer
- [x] **Auth UI** (`/app/signin`, `/app/signup`): social buttons, adaptive waitlist/registration
- [x] **Dashboard** (`/app`): onboarding + projects view (read-only)
- [x] **Flag control plane UI** (server actions, RLS-scoped): **projects** (list/create —
      new projects **auto-seed Production + Staging** envs, `DEFAULT_ENVIRONMENTS` in
      `[org]/actions.ts`; no SDK keys auto-created), **environments** (create + colors),
      **SDK keys** (create/reveal-once/revoke per env), **flag editor** —
      boolean/string/number/object **variants**, per-environment
      **state + default + targeting**, **Publish** → bundle (verified end-to-end → OFREP).
      NB: **environments are per-project** (LaunchDarkly/GitHub model); OpenFeature has no
      "environment" concept, so this is purely a product choice (see §9 / §11)
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
- [x] **Sudo** console (`/sudo`) + `/api/sudo/*`: **sudo-org-membership gated**, dogfooding switch, own subdomain;
      tools: **waitlist** (approve/reject) + **building-block requests** triage (status pipeline)
- [x] **Proxy** subdomain routing (app./sudo./api.) + central CORS + `/api` passthrough
- [x] **Docker** (migrate-on-start) + **Vercel** migrate-on-deploy; Neon-aware migrator
- [x] **Seed** (founder login + `flagon` sudo org + demo flags); FSL license; LLC entity

## 9. Path to a deployable v1 🚀

The eval loop, auth, infra, and now **flag authoring** are done. Critical path:

1. ~~Flag management UI~~ — **done**, incl. the **visual targeting rule builder**
   (condition + outcome, fractional rollout) and **Segments CRUD**. Remaining polish:
   **(a)** project / flag / environment / org **rename · delete · archive** (org rename/
   delete exist; project/flag/env do not);
   **(b)** a project/env **selector primitive** once a second product needs it;
   ~~**(c)** a `/sudo` page to triage the **building-block requests**~~ — **done**
   (`/sudo/requests`: status pipeline new→reviewing→planned→shipped/declined,
   overview "new" count badge).
   **(d) Environments — decided:** stay **per-project** (right for bundle/SDK-key
   scoping; OpenFeature is silent on environments). New projects now auto-seed
   Production + Staging. **Next option (not built):** an org-level "environment
   template" so the default set is configurable org-wide — `DEFAULT_ENVIRONMENTS`
   in `[org]/actions.ts` is the single thing that becomes template-driven. Do NOT
   pursue global/instance-level environments (Unleash model) — it fights the
   per-(project,env) bundle keying for little gain.
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

> **Pick up here next session.** Deploy is unblocked (git push to `main` migrates +
> builds on Vercel — see §7; just confirm the Vercel↔GitHub link, env vars, and
> `FLAGON_ADMIN_EMAIL` so you can reach `/sudo` on the fresh prod DB). The biggest
> *product* gap is that **pricing is marketing only — nothing enforces plans** (§11).
> Highest-value next work: **billing + entitlements (§10, the big one)** and the
> **rename/delete/archive** polish (item 1a). Quick wins available: the org-level
> **environment template** (item 1d) and **email verification** (item 4).
> Already done this session: mobile pass, OFREP org-binding **verified + hardened**
> (§11), `/sudo/requests` triage, projects-count fix, env auto-seed. **Pre-launch
> must-check:** RLS is bypassed locally (superuser role) — verify it actually engages
> in prod (§11). Also revisit **segment scoping** (§10).

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
- **OFREP org-binding — verified + hardened ✅.** Concern was: two orgs can have
  the same flag key (e.g. both `new-dashboard`); one org's SDK key must never read
  another's. How it's bound: eval resolves the SDK key → `{org, env}` (both from
  the same `sdk_keys` row, so env always belongs to that org), then
  `PostgresBundleStore.get()` runs inside `withTenant(org)` — the `bundles` RLS
  policy (FORCE RLS on `app.current_org`) **plus an explicit `organizationId`
  predicate** (added for defense-in-depth) **plus** the `environmentId` WHERE scope
  the read to exactly `(org, env)`. Env IDs are globally-unique UUIDv7; flag keys
  are unique per project, so no in-bundle collision. R2 keys are `<org>/<env>.json`
  (org-scoped). Locked in by `src/server/ofrep/handler.test.ts` (5 tests, no DB):
  two orgs / same key / distinct SDK keys → each reads only its own value (single +
  bulk), the store is never asked for a cross-tenant `(org, env)` pair, and
  invalid/missing keys 401 without touching the store. **Remaining (nice-to-have):**
  a DB-level integration test that exercises the actual RLS policy end-to-end
  (needs a live Postgres; the handler-seam test already proves the app-layer
  contract). Files: `src/server/ofrep/handler.ts`, `src/server/flags/sdk-keys.ts`,
  `src/server/bundles/{postgres,r2}-store.ts`.
- **RLS is NOT exercised locally — the dev Postgres role is `SUPERUSER`/`BYPASSRLS`.**
  Superuser roles bypass RLS entirely, so `withTenant()` + the `tenant_isolation`
  policies are effectively no-ops in local Docker (verified via `pg_roles`). This
  means tenant isolation has never actually run in dev, and dev/prod can diverge.
  **Before launch:** (1) run the app locally as a **non-superuser** role to truly
  exercise RLS; (2) confirm the **Neon role used in production is non-superuser**
  (it normally is, which is *why* RLS will engage in prod but not dev).
- **Legal pages** are solid baseline copy — **have counsel review** before launch.
- **Production subdomain routing + cross-subdomain auth** are implemented but only
  exercised locally (proxy is a no-op without `NEXT_PUBLIC_ROOT_DOMAIN`); validate
  on the real multi-subdomain deploy.
- **Neon is provisioned** via the Vercel integration but **not yet migrated/deployed**;
  the live DB is still local Docker. First production deploy runs migrations.
- Migrations: `0000_*.sql` (baseline) + `0001_*.sql` (feature_requests). Additive;
  applied on deploy. Locally run `pnpm db:migrate` (if Postgres reports too many
  connections, `docker compose restart db` first).
