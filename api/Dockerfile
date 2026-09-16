FROM golang:1.27.1 AS base
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

# Local development target: live-reloads on source changes via air, run with
# `docker compose up` (bind-mounts ./api over /src). Not used for deploys.
FROM base AS dev
RUN go install github.com/air-verse/air@latest
COPY . .
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

FROM base AS build
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api
# Static spec is a build artifact only (e.g. for client codegen); the running
# server also serves the live spec at /openapi.json, /openapi.yaml, /docs.
RUN go run ./cmd/genspec -out /out/openapi.json

# Default (final) target: the deployable artifact used by Fly.
FROM gcr.io/distroless/static-debian12 AS final
COPY --from=build /out/api /api
COPY --from=build /out/openapi.json /openapi.json
EXPOSE 8080
ENTRYPOINT ["/api"]
