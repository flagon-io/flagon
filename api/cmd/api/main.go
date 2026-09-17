// Command api runs the Flagon HTTP API.
//
// Usage:
//
//	api            run the HTTP server (does NOT touch the schema)
//	api migrate    provision the app role + run migrations, then exit
//
// Migrations are a deploy-time step, not a per-boot one: Fly runs `api migrate`
// as the release_command (once, before any serving machine rolls out), so many
// serving machines can never race to migrate. Serving machines just open the
// pool and serve.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/metrics"
	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		runMigrate()
		return
	}
	runServe()
}

// runMigrate provisions the app role and applies migrations, then exits. It is
// the deploy gate (Fly release_command): ANY failure - including an unreachable
// database - is fatal, so a broken or unverifiable schema never rolls out. Fly
// aborts the deploy and the previous version keeps serving.
func runMigrate() {
	cfg := db.ConfigFromEnv()
	if err := db.Setup(context.Background(), cfg); err != nil {
		log.Fatalf("FATAL: database setup failed; aborting deploy: %v", err)
	}
	log.Printf("database setup complete")
}

// runServe opens the runtime pool and serves. It never migrates, so it is safe
// to start any number of machines concurrently, and it starts even if the
// database is momentarily unreachable (readiness reports the outage).
func runServe() {
	ctx := context.Background()
	cfg := db.ConfigFromEnv()

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
	log.Printf("flagon api listening on %s", addr)
	if err := http.ListenAndServe(addr, m.InstrumentHTTP(router)); err != nil {
		log.Fatal(err)
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
	log.Printf("flagon metrics listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		// Metrics are non-essential; log but keep the API running.
		log.Printf("WARNING: metrics server stopped: %v", err)
	}
}
