# Flagon platform architecture

Flagon is a **developer platform**, not a feature-flag app — a hybrid internal
developer platform: the **hub you put everything into** (the portal) *and* the
**capabilities you'd otherwise build yourself** (the batteries). This document is
the target model everything is being re-seated onto (confirmed 2026-07-01).
Production was reset + rebaselined on this model (2026-07-01); deploys are normal/additive now.

## Positioning (locked)

- **Category:** the open-source developer platform — "the developer portal that's
  also the platform."
- **Hero:** *Stop building your platform. Start shipping on it.*
- **The extensible pieces are called "Capabilities."**
- **Capability #1 is the Catalog** — the hub itself: projects, environments, teams,
  ownership, and (growing) linked repositories, services, and more. Every other
  capability builds on it.
- **Capability #2 is Feature Flags** — built on projects + environments. It is NOT
  the first thing; the Catalog is. Then **Configuration & Secrets** and
  **Experiments** are the likely next up, followed by **Eventing & Webhooks** and
  **Audit Log**. **Observability** is *Under consideration* (we may build it or
  integrate a provider) and is surfaced in its own exploratory section — never
  over-promised as a native build.
- **Billing:** usage-based. Projects, environments, teams, and members are free; you
  pay for throughput per meter. Plans include a free allowance per meter.
- Marketing reflects all of this: `src/lib/capabilities.ts` is the single source of
  truth; the route is `/capabilities`.

## Two layers

**Substrate (primitives)** — must stand alone and make sense to someone who never
touches feature flags (this is what Vercel/Railway/Render *are* before products):

- **Organization** — tenant boundary + billing entity.
- **Team** — owns projects; has its own members, each with a **team role**
  (member / maintainer today; scaffolding for GitHub-style team permissions). Org → Teams
  → Projects.
- **Member / User** — identity + org-level role.
- **Project** — the unit of work (an app/service). **Owned by one or more Teams**
  (many-to-many via a `project_teams` join). Access to a project = org admin ∪ member of
  ANY owning team.
- **Environment** — an **org-level logical tier**: `production` / `staging` /
  `preview`. Shared vocabulary + `tier` classification + `rank` (promotion order). Also
  carries **descriptive metadata** about what/where it is: a provider hint
  (`aws` / `digitalocean` / `kubernetes` / `ec2` / `heroku` / `fly` / `other`), region,
  and free-form notes. This describes the tier's *nature*; the concrete per-project infra
  realization lives on the cell (below). No product data, keys, or bundles on it.
- **Project Environment (the cell)** — `(project × environment)`. THE universal
  attach point. This is where everything concrete lives: a project's realization of
  a tier. Infra metadata (Kube / EC2 / DO, region) lives here, not on the org-level
  tier (web-app's prod ≠ crm's prod). Every product hangs its per-env data off the
  cell.
- **Two credential systems, by design** (do not merge them — opposite security
  properties):
  - **API Token / PAT** (`api_tokens`, built) — **management-API** auth. Acts as a
    **principal** (a user via PAT, or an org role via org token), org-wide, narrowed by
    scopes. **Always secret / reveal-once.** Lives in org Settings. A publishable one
    would be account takeover, so there is intentionally NO publishable option here.
  - **Access Key** (`access_keys`, with capability wiring) — a **capability data-plane**
    credential scoped to a **cell + product + scope**. `product` = flags | deploy | otel
    | events…; `scope` distinguishes **`server` (secret)** from **`client` (publishable)**.
    Narrow by construction (one cell, one product), which is exactly why it can be public.
    Shared machinery (generate, hash, encrypt-at-rest for retrievable/publishable ones,
    resolve-by-hash, revoke) reused by every capability; Feature Flags is the first
    consumer (`product=flags`, `scope=client` = the publishable/React key, returns only
    client-available flags). Surfaced under the capability, per project × environment —
    NOT on the Environments primitive.
- **Usage meter** — product-agnostic `(org, meter, period, quantity)` rollups; the
  billing spine reads these. Meters are namespaced: `flags.evaluations`,
  `otel.ingest_bytes`, `deploy.builds`, …
- **Project Products (module registry)** — which products a project has enabled, so
  the workspace is modular (Flags / Events / …), never flag-centric. Products are
  independently usable.

**Capabilities** — the Catalog *is* the substrate-management capability; the rest
plug into the substrate via the cell:

| Capability          | What it is / attaches per cell                                      |
| ------------------- | ------------------------------------------------------------------ |
| **Catalog** (#1)    | the hub itself — manages projects, environments, teams, ownership; grows to linked repos/services |
| **Feature Flags** (#2) | SDK keys (access_keys product=flags), bundles; flags/segments per project |
| Config & Secrets    | typed config + secret refs per cell                                |
| Experiments         | metrics/assignment on top of flags                                 |
| Eventing & Webhooks | sources → destinations, per project                                |
| Audit Log           | immutable change trail                                             |
| Observability *(under consideration)* | OTel ingest per cell — or an integration; undecided |

Flag-specific machinery (flags, segments, bundles, OFREP, the compile/publish
pipeline, the two-plane control/data split) belongs to the **Feature Flags product**,
not the substrate. Each future product gets its own delivery mechanism; the platform
gives them identity, projects, environments, the cell, keys, and metering.

## Target schema (delivery addressed by the cell)

Substrate: `teams` + `team_members` (better-auth org teams), `projects` (+`team_id`),
`environments` (+`tier`,`rank`), **`project_environments`** (the cell: `project_id`,
`environment_id`, `status`, nullable `provider`/`region`/`metadata`), **`access_keys`**
(cell + `product` + `scope`; replaces `sdk_keys`), `project_products` (registry),
generic `usage_rollups` (`org`, nullable `project_id`, `meter`, `period`, `quantity`;
`NULLS NOT DISTINCT` unique).

Feature Flags: `flags` (project_id NULL = global, unchanged), `flag_environments`
(flag × environment, unchanged), `segments` (per project, unchanged), **`bundles`**
re-seated onto `project_environment_id` (unique `(project_environment_id, etag)`).

Delivery: an access key resolves (by hash, RLS-free) to
`{ organizationId, projectEnvironmentId, product, scope }`; the bundle store reads by
`{ organizationId, projectEnvironmentId }`. Publishing a project flag recompiles that
cell's bundle; publishing a global flag fans out to every cell in that environment.

## Access / RLS

- Org isolation stays RLS (FORCE, `app.current_org`) on all tenant tables incl. the
  cell, bundles, project_products, usage_rollups.
- `access_keys` + `api_tokens` stay **out of RLS** (resolved by hash before tenant
  context; management queries filter by org explicitly — same pattern as today).
- **Team ownership is app-layer authz**, not RLS: access to a project = org admin/owner ∪
  member of **any** owning team (`project_teams`). `gate()` / `requireMembership()` enforce.
  Team roles (member/maintainer) are recorded now but do not gate yet — that is the
  scaffolding-to-permissions step.

## Billing & entitlements

Usage-based. Projects, environments, teams, and members are free; you pay for
**throughput** per meter (the product-agnostic `usage_rollups` spine feeds this).
**Billing is built BEFORE any metered feature ships**, so metering "just works" the
moment a capability starts emitting.

Built on Stripe primitives, leaning on their hosted pages (we do not build billing UI):

- **Customer = Organization.** One Stripe customer per org (`organizations.stripe_customer_id`),
  not per user. Subscription lifecycle syncs to a local `subscriptions` table via webhooks.
- **Tiers = Products / Prices.** Free ($0, no card), Team (base + metered usage), Enterprise
  (custom / negotiated). A plan maps to a Stripe Product + Price(s).
- **Usage = Stripe Billing Meters.** Each app meter (`flags.evaluations`, …) maps to a Stripe
  meter/price; `usage_rollups` are reported per period. Plans include a free allowance; paid
  meters overage beyond it.
- **Coupons / promo codes = beta + trials.** A 100%-off Stripe Coupon is "Beta free access
  until revoked" (remove it to revoke); free trials are Stripe trial periods. Granted and
  revoked from `/sudo`.
- **Hosted pages, so we never touch payment/tax.** Stripe **Checkout** to start/upgrade,
  **Customer Portal** to add/manage cards + change plan + cancel, hosted invoices, **Stripe
  Tax** for automatic tax, and **Link** for saved payment. Cards, PCI, tax, and dunning are
  all Stripe's problem, not ours.
- **Entitlements layer.** The one app-side place that maps (org plan + subscription status) →
  allowed capabilities and usage limits. Reads synced subscription state; enforced in
  `gate()` and per capability. "Can this org do X / are they over their limit" lives here.

## Tenant isolation & placement

`tenant_placements(organization_id, mode, connection_ref)` is the seam for moving a noisy or
enterprise org OFF the shared pool so it can never blow up production for the shared RLS
tenants. Modes:

- **`shared`** (default; all orgs today): one main pool, RLS (FORCE, `app.current_org`)
  isolates rows.
- **`schema`**: same cluster, a dedicated Postgres schema per org (`search_path`), with RLS
  kept as defense-in-depth.
- **`dedicated`**: a separate database / cluster addressed by `connection_ref` — full physical
  isolation for whales and enterprise.

Design goal: moving an org is a **`tenant_placements` row change + a data move, with no
application code change.** That holds only because **every tenant query already goes through
`withTenant(orgId, …)`** — the single chokepoint. To make placement real, `withTenant`
resolves the org's placement and routes to the right connection (main pool + GUC / schema
`search_path` / dedicated pool). What that requires building: a **connection resolver** keyed
by placement, and a **migration runner that fans out** across placements (public schema +
each org schema + each dedicated cluster). Enterprise tier offers/forces `dedicated`.

## IA

- **Org**: Overview · Projects · Environments · Teams · Members · Usage · Settings ·
  Tokens.
- **Project workspace**: Overview, then a tab per **enabled product** (Feature Flags,
  …). Each product owns its per-env surface — **SDK keys live under Feature Flags**,
  per environment, NOT on the Environments page.
- **Environments** (org page): manage the tier set — name, key, color, `tier`, order.
  No product data.

## Phasing (billing-first)

**Done:** the Catalog baseline — projects + environments (org-level, `tier`/`rank`),
generic `usage_rollups` spine, dashboard, management API — with Feature Flags removed; and
**teams** (better-auth teams + `team_members`, default team per org, `projects.team_id`,
Teams page). ROADMAP.md is the authoritative status + task list.

1. **Billing (Stripe) — FIRST, before any metered feature.** Org ↔ Stripe customer; tiers
   as Products/Prices; Billing Meters wired to `usage_rollups`; coupons + trials (beta
   access, revocable); Checkout + Customer Portal; webhook sync into `subscriptions`; the
   entitlements layer.
2. **Tenant isolation / placement.** Route `withTenant` by `tenant_placements`; connection
   resolver + migration fan-out; enterprise → `dedicated`. The enterprise-tier enabler.
3. **Finish substrate.** Team-scoped project ACL in `gate()` + team member management;
   `project_environments` (the cell); generic `access_keys` (server/client scopes);
   `project_products` (module registry).
4. **Rebuild Feature Flags** on the substrate: flags/segments/bundles/OFREP re-seated on the
   cell + access_keys; **publishable (client) keys**; metering wired to billing.
5. **Further capabilities** (Config & Secrets, Experiments, Event Bus, …) on the same grid.
