// Package server wires up the chi router and Huma API used by both the
// running service (cmd/api) and the OpenAPI spec generator (cmd/genspec).
//
//go:generate go run ../../cmd/genspec
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
)

// Options configures optional server dependencies.
type Options struct {
	// ReadyCheck reports whether the service can serve real traffic - today,
	// whether Postgres is reachable. A nil check means "no dependencies", so
	// readiness is always OK. It backs /readyz, never /healthz: the process
	// stays live (and the deploy stays up) even while a dependency is down.
	ReadyCheck func(ctx context.Context) error
}

// Option mutates Options.
type Option func(*Options)

// WithReadyCheck wires a dependency probe (e.g. db.Ping) into /readyz.
func WithReadyCheck(check func(ctx context.Context) error) Option {
	return func(o *Options) { o.ReadyCheck = check }
}

// New builds the chi router and Huma API. Every operation registered via
// huma.Register is automatically documented in the generated OpenAPI spec.
// To opt an endpoint OUT of documentation, register it directly on the chi
// router (like the health checks below) instead of through huma.Register.
func New(opts ...Option) (chi.Router, huma.API) {
	var options Options
	for _, opt := range opts {
		opt(&options)
	}

	router := chi.NewMux()
	api := humachi.New(router, huma.DefaultConfig("Flagon API", "0.0.0"))

	registerHealthChecks(router, options)
	registerIndex(router, api)

	return router, api
}

func registerHealthChecks(router chi.Router, options Options) {
	// Liveness: is the process up? Independent of dependencies on purpose, so a
	// database outage never makes Fly kill or fail to start the machine.
	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Readiness: can we serve real traffic? This is where a down database
	// becomes loud - 503 with the reason - without taking the process down.
	router.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		body := map[string]string{"status": "ok", "database": "ok"}
		code := http.StatusOK

		if options.ReadyCheck != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			if err := options.ReadyCheck(ctx); err != nil {
				body["status"] = "degraded"
				body["database"] = "unavailable: " + err.Error()
				code = http.StatusServiceUnavailable
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(body)
	})
}
