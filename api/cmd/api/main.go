// Command api runs the Flagon HTTP API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	ctx := context.Background()
	cfg := db.ConfigFromEnv()

	// Run migrations (and provision the RLS app role) on every boot. The
	// boundary is deliberate:
	//   - a reachable database with a failing/tampered migration is FATAL, so a
	//     broken schema never ships;
	//   - an unreachable database is NOT fatal, so a database blip can't take
	//     the deploy down - we start degraded and say so on /readyz.
	if err := db.Setup(ctx, cfg); err != nil {
		if errors.Is(err, db.ErrUnavailable) {
			log.Printf("WARNING: database unavailable; starting in DEGRADED mode without migrations. /readyz will report the outage: %v", err)
		} else {
			log.Fatalf("FATAL: database migration failed; refusing to start against a broken schema: %v", err)
		}
	}

	database := db.Open(ctx, cfg)
	defer database.Close()

	router, _ := server.New(
		server.WithReadyCheck(database.Ping),
		server.WithRLSCheck(database.CheckRLS),
	)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	log.Printf("flagon api listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}
