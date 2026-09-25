# Developer shortcuts. Every target is a thin wrapper over the commands in
# AGENTS.md "Local development", so the Makefile never becomes a second source of
# truth. Recipes use only `cd dir && cmd`, which runs the same under GNU make on
# Linux CI, macOS, and Windows (Git Bash or cmd).

.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "Local development"
	@echo "  make dev              start Postgres, then run the API and the app together"
	@echo "  make api              run the API natively on :8080 (migrates on boot)"
	@echo "  make app              run the app natively on :3000 (builds @flagon-io/ui first)"
	@echo "  make db               start the compose Postgres (flagon_api + flagon_app)"
	@echo "  make migrate          apply API migrations + the app's auth migrations"
	@echo "  make seed             create the demo user + org (needs the API running)"
	@echo "Quality"
	@echo "  make test             Go tests + design system unit tests"
	@echo "  make lint             go vet + golangci-lint + eslint + ui typecheck"
	@echo "  make check            all drift checks + lint + test (what CI enforces)"
	@echo "Generated artifacts"
	@echo "  make openapi          write openapi/openapi.json"
	@echo "  make api-types        regenerate the app's TypeScript API types from the spec"
	@echo "  make docs|roadmap|changelog            regenerate an embedded corpus"
	@echo "  make docs-check|roadmap-check|changelog-check   fail if a corpus is stale"

# --- Local development -------------------------------------------------------

# db starts the one local Postgres instance (both databases) in Docker. Copy
# compose.override.example.yml to compose.override.yml once to publish :5432.
.PHONY: db
db:
	docker compose up -d postgres

# api runs the Go API natively; it applies migrations on boot, then serves :8080.
.PHONY: api
api:
	cd api && go run ./cmd/flagon-server serve

# app runs the Next.js app natively (the root dev script builds @flagon-io/ui
# first, then starts next dev on :3000).
.PHONY: app
app:
	npm run dev

# dev brings up Postgres, then runs the API and the app in parallel in this
# terminal (Ctrl-C stops both).
.PHONY: dev
dev: db
	$(MAKE) -j2 api app

# migrate applies the API's schema migrations (and provisions the RLS app role),
# then the app's BetterAuth migrations. The API also migrates itself on boot.
.PHONY: migrate
migrate:
	cd api && go run ./cmd/flagon-server migrate
	cd app && npm run db:migrate

# seed creates the static-password demo user (demo@flagon.dev / password12345)
# and its baseline org. The org is created through the API, so it must be running.
.PHONY: seed
seed:
	cd app && npm run db:seed

# --- Quality -----------------------------------------------------------------

.PHONY: test
test: test-go test-ui

.PHONY: test-go
test-go:
	cd api && go test ./...

.PHONY: test-ui
test-ui:
	npm run test:unit

.PHONY: lint
lint: lint-go lint-app typecheck-ui

# GOLANGCI_LINT_VERSION matches the version CI pins (.github/workflows/ci.yml).
GOLANGCI_LINT_VERSION := v2.14.0

# lint-go runs go vet, then golangci-lint (api/.golangci.yml) when it is on PATH.
# Without it, the golangci-lint half is skipped with an install hint rather than
# failing, so `make lint` still works on a fresh machine; CI always runs it.
.PHONY: lint-go
lint-go:
	cd api && go vet ./...
	@if command -v golangci-lint >/dev/null 2>&1; then \
		cd api && golangci-lint run; \
	else \
		echo "golangci-lint not found; skipping. Install it with: go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)"; \
	fi

.PHONY: lint-app
lint-app:
	npm run lint

.PHONY: typecheck-ui
typecheck-ui:
	npm run typecheck --workspace @flagon-io/ui

# check is the local mirror of CI's gates: every committed corpus is fresh, and
# lint and tests pass. Run it before pushing.
.PHONY: check
check: docs-check roadmap-check changelog-check lint test

# --- Generated artifacts -----------------------------------------------------

.PHONY: openapi
openapi:
	cd api && go run ./cmd/genspec

# Optional: the running api server already serves the live spec at
# /openapi.json and /openapi.yaml - no regen needed for local dev.

# api-types regenerates the app's committed TypeScript API types from a fresh
# spec. CI runs the same pair and fails on any diff, so the app's types can
# never drift from the API.
.PHONY: api-types
api-types: openapi
	npm run gen:api-types --workspace app

# docs compiles the top-level docs/ tree into the corpus the API embeds. Run it
# after editing anything under docs/ and commit the regenerated corpus.
.PHONY: docs
docs:
	cd api && go run ./cmd/gendocs

# docs-check fails if the committed corpus is stale (the CI drift gate). Keeps
# documentation and code from diverging: a doc edit that skips `make docs` fails.
.PHONY: docs-check
docs-check:
	cd api && go run ./cmd/gendocs -check

# roadmap compiles the top-level roadmap/ tree into the corpus the API embeds.
# Run it after editing anything under roadmap/ and commit the regenerated corpus.
.PHONY: roadmap
roadmap:
	cd api && go run ./cmd/genroadmap

# roadmap-check fails if the committed corpus is stale (the CI drift gate), so a
# roadmap edit that skips `make roadmap` fails the build.
.PHONY: roadmap-check
roadmap-check:
	cd api && go run ./cmd/genroadmap -check

# changelog compiles the top-level changelog/ tree into the corpus the API embeds.
# Run it after adding an entry under changelog/ and commit the regenerated corpus.
.PHONY: changelog
changelog:
	cd api && go run ./cmd/genchangelog

# changelog-check fails if the committed corpus is stale (the CI drift gate).
.PHONY: changelog-check
changelog-check:
	cd api && go run ./cmd/genchangelog -check

.PHONY: api-docker-build
api-docker-build:
	docker build -t flagon-api -f api/Dockerfile api
