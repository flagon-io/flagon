.PHONY: openapi
openapi:
	cd api && go run ./cmd/genspec

# Optional: the running api server already serves the live spec at
# /openapi.json and /openapi.yaml - no regen needed for local dev.

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

.PHONY: api-docker-build
api-docker-build:
	docker build -t flagon-api -f api/Dockerfile api
