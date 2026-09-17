# syntax=docker/dockerfile:1

FROM golang:1.27-alpine AS base
RUN apk add --no-cache ca-certificates tzdata git && update-ca-certificates
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
  --mount=type=cache,target=/root/.cache/go-build \
  go mod download

# Live-reload target for `docker compose up` (bind-mounts ./api over /src).
FROM base AS dev
RUN go install github.com/air-verse/air@latest
COPY . .
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

FROM base AS build
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
  --mount=type=cache,target=/root/.cache/go-build \
  CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM alpine AS final
RUN apk add --no-cache ca-certificates tzdata wget postgresql-client \
  && adduser -S -D -H -h /app appuser
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=build /out/api /usr/local/bin/api
WORKDIR /app
USER appuser
ENV PORT=8080
EXPOSE 8080
# GET, not --spider (HEAD): the health route only answers GET.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null "http://localhost:${PORT}/healthz" || exit 1
ENTRYPOINT ["/usr/local/bin/api"]
