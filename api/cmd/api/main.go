// Command api runs the Flagon HTTP API.
//
// Usage:
//
//	api            run the HTTP server (migrates on boot, then serves)
//	api migrate    provision the app role + run migrations, then exit
//
// Migrations run on boot: serving machines apply them, serialized by an advisory
// lock so concurrent boots never race (see internal/db). Fly Managed Postgres is
// not reachable from a release_command machine, so we cannot use that for
// migrations; a regular serving machine reaches it fine.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/metrics"
	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		runMigrate()
		return
	}
	runServe()
}

// runMigrate provisions the app role and applies migrations, then exits. Handy
// for running migrations by hand (`fly machine run <image> migrate`); ANY
// failure is fatal so a broken schema is loud.
func runMigrate() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cfg := db.ConfigFromEnv()
	if err := db.Setup(ctx, cfg); err != nil {
		slog.Error("database setup failed", "err", err)
		os.Exit(1)
	}
	slog.Info("database setup complete")
}

// runServe migrates (via an advisory lock, so concurrent boots are safe), then
// opens the runtime pool and serves. The migration step is degraded-tolerant:
// a reachable database with a failing migration is fatal (never serve a broken
// schema), but an unreachable one starts degraded (readiness reports it) rather
// than blocking the boot.
func runServe() {
	ctx := context.Background()
	cfg := db.ConfigFromEnv()

	setupCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	if err := db.Setup(setupCtx, cfg); err != nil {
		if errors.Is(err, db.ErrUnavailable) {
			slog.Warn("database unavailable; starting DEGRADED without migrations, /readyz will report it", "err", err)
		} else {
			slog.Error("database migration failed; refusing to start against a broken schema", "err", err)
			os.Exit(1)
		}
	}
	cancel()

	database := db.Open(ctx, cfg)
	defer database.Close()

	m := metrics.New(database.Pool())

	router, _ := server.New(
		server.WithReadyCheck(database.Ping),
		server.WithRLSCheck(database.CheckRLS),
		server.WithIdentity(database, os.Getenv("FLAGON_INTERNAL_TOKEN")),
	)

	// Metrics live on a separate, private port that Fly's Prometheus scrapes
	// (see [metrics] in fly.toml); they are never exposed on the public service.
	go serveMetrics(m)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	slog.Info("api listening", "addr", addr)
	if err := http.ListenAndServe(addr, m.InstrumentHTTP(router)); err != nil {
		slog.Error("http server stopped", "err", err)
		os.Exit(1)
	}
}

func serveMetrics(m *metrics.Metrics) {
	port := os.Getenv("METRICS_PORT")
	if port == "" {
		port = "9091"
	}
	mux := http.NewServeMux()
	mux.Handle("/metrics", m.Handler())

	addr := ":" + port
	slog.Info("metrics listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		// Metrics are non-essential; log but keep the API running.
		slog.Warn("metrics server stopped", "err", err)
	}
}
