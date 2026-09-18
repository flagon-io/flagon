# Flagon - agent & contributor guide

This is the root guide for anyone (human or AI) working in this repo. It sets
the architecture, the principles that must not be violated, and the "golden
path" for adding capabilities. Read it before making structural changes.

`CLAUDE.md` is a symlink to this file.

## What Flagon is

Flagon is a self-hostable **developer platform for operating your whole system**:
your projects, the tools around them, and the people who work on them, in one
place you drive from the dashboard, the API, or an AI assistant. It is **powerful
with AI and great without it** - AI is a first-class surface, never a requirement.
A team can run Flagon as a straight DX platform and get full value; the AI is an
accelerant on top, not a toll gate.

The core unit today is a **Project** (a deployable app, in the Vercel model - no
separate "app" layer). Everything operates inside an **organization**: URLs are
`app.flagon.io/<org>/...`, with personal account settings at `/settings` as the
one exception.

The direction is broad: Flagon is growing into the hub for an engineering system,
with AI woven through it and run safely over real data. Beyond projects &
deployments today, the pillars are connected **context** across your tools,
**agents** and orchestration with humans in the loop, an **MCP hub**, **metrics**
and insight (a real "what changed across everything this week"), reusable
**skills**, and the **governance** to run all of it safely. These land over time;
each is already stubbed in `docs/` marked `status: planned`, which is the
canonical map of where the product is headed - build against it.

## Architecture

Three deployables, one repo (npm workspaces + a Go module):

| Path | What | Stack | Role |
| --- | --- | --- | --- |
| `app/` | `app.flagon.io` - web UI + gateway | Next.js 16, React 19, Tailwind v4 | Renders UI, holds the user session, forwards to the API |
| `api/` | `api.flagon.io` - source of truth | Go (chi + [huma](https://huma.rocks)) | Owns all business data/logic, multi-tenant via Postgres RLS, hosts the AI agent + MCP server |
| `packages/ui/` | `@flagon-io/ui` - design system | React + Radix | Accessible components; docs at `/ui`, shadcn registry at `/r/*.json` |

- **`app` is a thin gateway.** It never talks to Postgres or Stripe directly for
  domain data; it forwards to `api` with the internal token + verified user
  identity headers (`X-Flagon-User-Id`, `X-Flagon-User-Email`). Auth (BetterAuth)
  and the user account live in `app`; the domain lives in `api`.
- **`api` is the source of truth and the single writer of domain data.** It
  enforces tenant isolation with forced Postgres Row-Level Security and two DB
  roles (a migrator role for schema, a `NOBYPASSRLS` app role for every runtime
  query). Org SSO/2FA gating is enforced here as well as at the app gate.

## The three non-negotiable principles

### 1. API-first
Every capability is an API operation first. Handlers are registered with
`huma.Register`, so the **OpenAPI spec is generated from the code** - never
hand-written. The running API serves it live at `/openapi.json` and
`/openapi.yaml`; `make openapi` (or `cmd/genspec`) writes `openapi/openapi.json`
for client generation. If it isn't in the API, it doesn't exist.

### 2. AI-first
Anything a user can do in the UI, they can do by asking the AI - and vice versa.
The AI is not a bolt-on; it is wired in at the root so that **every new
capability becomes available to the agent as it's built**. A user can create a
project by clicking or by asking; drop a CSV to bulk-update projects and the
agent detects intent and helps. As the suite grows (deployments, connected
context, agents, metrics, and the rest of the pillars), the agent grows with it.
This is capability parity, not a mandate: the platform is fully usable without
ever talking to the AI.

### 3. AI + MCP + API stay in lockstep
The AI agent and the **MCP server (`mcp.flagon.io`)** expose the *same*
operations as the HTTP API - one tool registry, three front doors (REST for
apps, MCP for external agents, the in-product agent for users). Adding an
operation once makes it available everywhere. The registry also carries the
read-only **documentation tools** (`search_docs`, `get_doc`), so the agent and
the public MCP can answer questions from the docs and handbook, not just operate
the platform. Tools marked `Public` (docs today) are the only ones the
unauthenticated MCP exposes; user-acting tools require the authenticated
surfaces.

## The AI layer

Lives in the Go API (the key is in `api/.env`: `ANTHROPIC_API_KEY`,
`ANTHROPIC_WORKSPACE_ID`). Design constraints:

- **Scoped to Flagon, hard.** The system prompt and tool set confine the agent
  to operating Flagon on the user's behalf. It is not a general chatbot. This is
  enforced by giving it only Flagon tools and a constraining system prompt, and
  by rejecting off-topic requests.
- **Human-in-the-loop (HITL).** Read operations can run freely; **mutations are
  proposed, not auto-executed** - the agent returns a structured proposed action
  the UI confirms before it runs. The user stays in control.
- **Acts as the user.** Tools execute with the requesting user's identity and org
  scope, so the agent can never do anything the user couldn't do themselves (RLS
  + membership/role checks still apply). Permissions are the ceiling.
- **Model-swappable, cost-tiered, sovereign-capable.** The provider/model is
  configuration, not code, behind an `ai.Provider` interface. Three backends ship:
  Anthropic (prod default, Haiku class); any **OpenAI-compatible** endpoint (the
  lingua franca - point `FLAGON_AI_BASE_URL` at OpenAI, OpenRouter, Together,
  Groq, or a self-hosted **Ollama/vLLM** to run your own OSS model for a flat
  cost); and an offline **mock** so the agent works locally with no keys.
  Selection is `FLAGON_AI_PROVIDER=auto|anthropic|openai|mock` (auto prefers
  Anthropic, then an OpenAI-compatible endpoint, then mock). The model is the
  brain and the tool registry is the hands, so even a small local model is
  viable: it only classifies intent and routes to a tool; the tool does the work.
  The system prompt is a swappable "SKILL" file (`--ai-system-prompt-file`) you
  iterate without recompiling.
- **Metered per organization.** Every agent turn records usage (tokens/requests)
  against the org so plans can be enforced. **Free plans must be rate/quota
  limited** - never ship unrestricted AI. Track first, enforce at the org level.

The dashboard leads with the agent (Cloudflare "Let's get to work" style): the
first thing on `/<org>` is the AI/command surface, not a wall of stats.

## The golden path: adding a capability

To add, say, "delete a project":

1. **API operation** - register a huma operation in `api/internal/server` that
   calls the domain/service layer (which enforces RLS + membership). It now
   appears in the OpenAPI spec automatically.
2. **Tool** - add it to the shared tool registry (`api/internal/ai/tools.go`,
   backed by the `ai.Store` surface) so the one registry exposes it as both an MCP
   tool and an agent tool. Give it the same scope as its operation and mark
   mutations `Mutating`. **This step is not optional and is not a follow-up.** A
   user-facing capability that exists in the API and UI but has no tool is a bug,
   not a smaller version of done: the agent and MCP go blind to it (e.g. "I don't
   have a tool to list projects" while the projects page works). If it isn't in
   the registry, the AI can't do it - and AI-first (principle #2) is violated.
3. **UI** - build the UI in `app/` that calls the API through the gateway.
4. **Docs** - add or update the page under `docs/` in the *same* change, then
   `make docs` to regenerate the embedded corpus. Documentation is part of the
   work, not a follow-up: CI runs `gendocs -check` and fails if the corpus is
   stale, so a capability and its docs land together.

Do them in that order, and **do not consider a capability done until all four
exist**. Steps 1, 2, and 4 land in the *same* change - API, tool, and docs are
one unit of work; only the UI may trail. Never let the UI reach around the API,
and never add an agent/MCP tool that isn't backed by a real, permission-checked
API operation.

## Documentation

Docs live in the top-level `docs/` tree (see `docs/README.md`) and are the single
source of truth: they ship in the same repo and PR as the code, so they cannot
drift. `cmd/gendocs` (`make docs`) compiles them into `internal/docs/corpus.gen.json`,
which the API embeds. From that one corpus:

- the API serves public pages at `/docs`, `/docs/search`, `/docs/page` (plain
  routes, deliberately **not** in the OpenAPI spec - docs are content, not part
  of the product's operational API contract);
- the agent and the public MCP answer questions via `search_docs` / `get_doc`;
- the website renders its docs entirely as a client of the `/docs*` routes, so it
  holds no copy.

Each page has frontmatter with a `visibility` of `public` or `internal`. Internal
pages (e.g. parts of the handbook) are readable by the in-product agent for
authenticated users but never leave the org: they are excluded from the public
`/docs*` routes and the public MCP.

## Local development

One Postgres instance in Docker (two databases), servers run natively:

```sh
cp compose.override.example.yml compose.override.yml   # once: publish local ports
docker compose up -d postgres                          # flagon_api + flagon_app on :5432

cd api && go run ./cmd/flagon-server serve   # API on :8080 (godotenv loads api/.env)
cd app && npm install && npm run dev         # app on :3000; npm run db:migrate; npm run db:seed
```

The API server is `cmd/flagon-server` (serve + migrate; the only binary that
touches Postgres). `cmd/flagon` is the separate user-facing CLI - a thin HTTP
client that talks to the API as the authenticated user; it is a baseline skeleton
today (commands return "not implemented"), not yet shipped.

- `api/.env` (gitignored) is loaded by godotenv at startup - put local secrets
  (Anthropic key, etc.) there. Config is urfave/cli flags with env sources +
  sane local defaults, so `go run ./cmd/flagon-server serve` needs no setup for the DB.
- `npm run db:seed` makes a static-password demo user (`demo@flagon.dev` /
  `demo` / `password12345`) and a baseline org (`/demo`) the user owns
  (created via the API's `POST /orgs`, so it needs the API running); the login
  screen pre-fills the credentials in dev.
- Component library docs + live examples at `http://localhost:3000/ui`.

## Conventions & guardrails

- **No em dashes** anywhere (`-` character), in code, copy, docs, or messages.
- **Don't name vendors we imitate** in source (no "GitHub-style" in code/comments).
- **Org-scoped by default**; personal `/settings` is the only non-org route.
- **RLS is sacred**: runtime queries use the `NOBYPASSRLS` app role; never bypass
  tenant scoping. The agent gets no special powers here.
- **UI/UX bar**: hybrid Vercel/Cloudflare/GitHub feel - real dialogs, typeahead
  pickers, no toy forms. Build on `@flagon-io/ui`.
- **Creation is a destination, not an afterthought.** Prefer a dedicated
  creation page for anything a user makes (tokens, members, emails, projects,
  orgs); use a modal only when a full page is overkill. Never an inline
  "type here + Add" form stuck on a list page. The list page gets a primary
  "New ..." action that routes to the creation surface.
- **Every user capability ships a tool.** Because the AI agent, the MCP server,
  and the REST API are one tool registry with three front doors (principle #3),
  a new user-facing operation must be added to `api/internal/ai/tools.go` in the
  same change as the operation - same scope, `Mutating` where it writes. A
  capability without a tool is invisible to the agent and MCP and counts as
  unfinished. (Pure infra/internal endpoints that no user would ask the AI to run
  are the only exception.)
- **We audit org changes.** Auditing is a first-class subsystem in
  `api/internal/audit` (typed `Action` keys, `Entry`/`Event`/`Filter`/`Page`, a
  write seam `audit.Record`, and a read `audit.Store`). Every mutation of an
  organization's state records an entry, so "who did what, where, when" is always
  answerable. Inside the mutation's own transaction call
  `recordAudit(ctx, tx, orgID, actorID, audit.ActionX, targetType, targetID, summary)`
  (the thin `db/audit.go` wrapper over `audit.Record`) - the entry commits
  atomically with the change, so a missing audit line is a bug, not a follow-up.
  Add the `Action` constant in `internal/audit` when you add a mutation; the
  summary is a human predicate; the "where" (IP/country/UA) is read from context,
  never threaded through the domain layer. The log is append-only (no
  update/delete) and readable by org owners/admins only (the `flagon.org_audit`
  window + the RLS policy enforce the role). It is a SEPARATE system from user
  notifications. The write and read go through the `audit` package's seams
  precisely so it can move to a separate service / columnar store (ClickHouse)
  later - a swap behind `Record`/`Store`, not a rewrite of call sites.
- **Permission-scoped by default.** Every capability carries a scope from day
  one, even while org RBAC stays simple. Anything that mints a credential
  presents its permissions the way classic tokens do: a grouped, hierarchical
  checklist where a parent scope implies its children, each row labeled with the
  raw scope and a one-line description. The shared vocabulary lives in
  `api/internal/server/scopes.go` (`operationScopes` maps every operation to a
  scope; enforcement fails closed). Add a scope when you add an operation, and
  cover it: `internal/server/permissions_test.go` drives real scoped tokens
  through `combinedAuth` against registered operations (200 vs 403) - copy that
  table for any new endpoint so permissions stay provably correct.
- **The user makes their own git commits.** Don't commit unless asked.

## Deploy

Push to `main` auto-deploys both services via CI: `app` to Vercel, `api` to
Fly. Migrations run on API boot (and at Vercel build for `app`'s auth tables).
Never tell someone to run `fly deploy` by hand.
