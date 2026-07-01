# Flagon roadmap — state & plan

The single source of truth for **where we really are** and **what we build next**.
Target model + design detail live in [ARCHITECTURE.md](./ARCHITECTURE.md); deep history,
conventions, and how-to-run live in [PROJECT.md](./PROJECT.md).

**Sequencing.** Substrate ownership first (**teams — done**), then **make the platform
primitives + UX excellent**, then **billing before any metered feature**, then **Feature
Flags** as the first metered capability, then more. Nothing that meters ships before billing.

---

## Where we are

Mid-pivot to a hybrid IDP: a **Catalog** (projects, environments, teams, ownership) plus
**capabilities** on top. The Catalog baseline is in, teams own projects with managed
membership + roles, and Feature Flags is removed pending a clean rebuild. Nothing is billed
yet, and every org runs on the one shared RLS pool.

---

## What we have (done)

### Positioning & marketing

- Hub + capabilities narrative; hero "Stop building your platform. Start shipping on it."
- Catalog is capability #1, Feature Flags #2. Three tiers on `/capabilities`: roadmap,
  under consideration, moonshots. Single source of truth `src/lib/capabilities.ts`; route
  `/capabilities`; rendered copy em-dash-free.

### Foundation

- Next.js 16; Docker; Vercel deploy; Neon Postgres; migrate-on-deploy.
- **Auth** (BetterAuth): email/username + social, organization plugin **with teams**, JWKS +
  session→JWT seam, invitations, invite-only waitlist gating.
- **Multitenancy**: Postgres RLS (FORCE, `app.current_org`) via `withTenant()` — the single
  tenant chokepoint. `tenant_placements` seam exists but is **not routed yet** (all shared).
- **Management API** `/api/v1`: health, me, token, projects (+ OpenAPI). `api_tokens`
  (PAT + org tokens) + JWT exchange + per-token rate limiting.

### Catalog + teams

- `projects` (**owned by a team** — single `team_id` today) + org-level `environments`
  (`tier`, `rank`); generic `usage_rollups` metering spine.
- **Teams — full association scaffolding**: `teams` + `team_members` (team role
  member/maintainer), default team per org, project→team ownership. Managed from the Teams
  list/detail, the project page (owning-team picker), and the Members page (per-person team
  chips + a manage modal). **Team roles are recorded/editable but gate nothing yet.**
- Dashboard: Overview · Projects · Environments · Teams · Members · Settings. Feature Flags
  shows as a disabled **Soon™** group.
- Design system + `/sudo` console (waitlist, capability-request triage, design catalog).

### Not started / removed (being honest)

- **Billing: not started** (orphan `subscriptions` + `users.stripe_customer_id` only).
- **Tenant placement: seam only** (no placement-aware routing).
- **Feature Flags: removed** — rebuilt on the substrate later.
- **Ownership is single-team today**; multi-team is Phase 1.
- **UI is rough** — management levers and general UX need real work.

---

## What we build next (in order)

### Phase 1 — Platform finalization + UX overhaul

Make the primitives excellent and genuinely manageable before layering billing + capabilities.

#### Ownership model

- [ ] **Projects owned by more than one team**: replace single `projects.team_id` with a
  `project_teams` join (project ↔ team, many-to-many). `createProject` seeds the default
  team; ownership editable as a multi-select.
- [ ] Access rule stays app-layer: project access = org admin ∪ member of **any** owning team
  (wire in Phase 4's ACL step, but model it now).

#### Environment metadata

- [ ] Environments describe what/where they are: **provider/kind** (`aws` / `digitalocean` /
  `kubernetes` / `ec2` / `heroku` / `fly` / `other`), region, and free-form notes. Add the
  columns; edit in the Environments UI; show the provider on the env + anywhere envs render.
- [ ] Keep the split clear: this is the tier's *nature*; concrete per-project infra lands on
  the cell when Deployments-type capabilities need it.

#### UX overhaul / management levers

- [ ] **Users/Members page**: see and change a person's teams and team role inline (smoother
  than a modal), plus their org role, invites, and status — one strong management surface.
- [ ] **Projects**: rich detail (name, slug, description, owning teams, environments,
  capabilities placeholder), rename/delete/archive, better list (filters, owner, search).
- [ ] **Teams**: detail with members + roles + owned projects; rename/delete (respect
  better-auth's "can't remove the last team"); add members from the team side and the user
  side, consistently.
- [ ] **Environments**: reorder (rank), recolor, tier + provider metadata, delete guards.
- [ ] Design-system pass for the new controls (multi-select, metadata forms, inline editing),
  plus empty/loading/error states, keyboard, and responsive polish across the dashboard.

#### Platform completeness

- [ ] Management API + OpenAPI parity for teams and environments (CRUD), not just projects.
- [ ] Audit-log the substrate mutations (project/team/env create/update/delete, membership).
- [ ] "Primitives excellent" review: every primitive has full CRUD, sane defaults, clear
  ownership, and a good empty state.

### Phase 2 — Billing (Stripe), before any metered feature

Metered, and Stripe owns the money/tax so we don't. Lean on hosted pages; no billing UI.

- [ ] BetterAuth **Stripe plugin**; **Customer = Organization**
  (`organizations.stripe_customer_id`); lifecycle synced to `subscriptions` via **webhooks**.
- [ ] **Tiers as Products/Prices**: Free ($0, no card), Team (base + metered usage),
  Enterprise (custom).
- [ ] **Stripe Billing Meters** mapped to app meters (`flags.evaluations`, …), fed from
  `usage_rollups`. Included allowance per plan; overage on paid. **Metered as we expand** —
  each capability declares meters; entitlements decide what's paid vs allowed and we charge
  accordingly.
- [ ] **Managed pages, so we never touch payment/tax**: Checkout (upgrade), Customer Portal
  (add/manage cards, change plan, cancel), hosted invoices, **Stripe Tax**, **Link**. Cards,
  PCI, tax, dunning = Stripe's problem.
- [ ] **Coupons + trials**: a 100%-off coupon = "Beta free access until revoked"; free trials
  as Stripe trial periods. Grant/revoke from `/sudo`.
- [ ] **Entitlements layer**: (org plan + subscription status) → allowed capabilities +
  limits; enforced in `gate()` / per capability. Billing + usage surfaced in the dashboard.

### Phase 3 — Tenant isolation / placement

The enterprise-tier enabler; protects shared tenants from a whale.

- [ ] Make `withTenant` **placement-aware**: resolve `tenant_placements` and route to `shared`
  (pool + GUC) / `schema` (search_path) / `dedicated` (`connection_ref` pool).
- [ ] **Migration runner fan-out** across placements (public + per-org schema + each cluster).
- [ ] Tooling to **move an org** (provision → copy → flip the row → cut over), no app-code
  change. Enterprise onboarding offers/forces `dedicated`.

### Phase 4 — Feature Flags, full buildout (first metered capability)

- [ ] Substrate bits it needs: **`project_environments`** (the cell), generic **`access_keys`**
  (server/client scopes), **`project_products`** (module registry).
- [ ] **Org-scoped (global) AND project-scoped flags**: a global flag (no project) merges into
  every project's bundle; project flags are scoped to their project. Plus segments, targeting,
  fractional rollouts, per-subject overrides.
- [ ] Compile to immutable **bundles** per cell; **OFREP** evaluation.
- [ ] **Safe for frontend AND backend**: **server keys** (secret, full context, every flag)
  and **client/publishable keys** (public, embeddable in React/browser/mobile, return only
  client-available flags). Both are `access_keys` with a scope; no proprietary client.
- [ ] **Metering wired to billing** (`flags.evaluations` → `usage_rollups` → Stripe).
- [ ] Dashboard: Feature Flags module per project (flip Soon™ → live); global flags surface;
  keys managed per (project, environment) under the capability.

### Phase 5 — Further capabilities

Configuration & Secrets, Experiments, Event Bus, Audit Log — on the same grid. Exploratory
(Deployments, Automations, Observability, …) live on `/capabilities` and don't block launch.

### Phase 6 — Launch

- [ ] Email deliverability + DMARC; `app.`/`sudo.` shared-session check; open the waitlist /
  GA. (Prod is already reset, rebaselined, and deployed on the current schema.)

---

## Cross-cutting / anything else

- **Prod was reset + rebaselined (2026-07-01)** onto the consolidated baseline and deployed;
  **deploys are normal / additive now** — no further wipe needed. `migrate.ts` stays
  non-destructive.
- **Isolation is a hard requirement**: a whale must be movable to its own schema/cluster so it
  can't degrade the shared pool. It holds because everything routes through `withTenant`.
- **Team roles → permissions**: membership, team roles, and multi-team ownership are the
  scaffolding; turning them into real GitHub-style gating (project access, per-team + per-project
  permissions) happens when we wire `gate()` in Phase 4.
- **Rounding out the product**: email verification + onboarding polish; in-app notifications;
  the Feature Flags docs rewrite when it returns; keep `DESIGN_SYSTEM.md` current as the UX
  overhaul adds primitives.
- Keep `BETTER_AUTH_SECRET` stable (JWKS + future access-key encryption depend on it).
