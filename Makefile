.PHONY: openapi
openapi:
	cd api && go run ./cmd/genspec

# Optional: the running api server already serves the live spec at
# /openapi.json, /openapi.yaml, and /docs - no regen needed for local dev.

.PHONY: api-docker-build
api-docker-build:
	docker build -t flagon-api -f api/Dockerfile api
