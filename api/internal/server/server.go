// Package server wires up the chi router and Huma API used by both the
// running service (cmd/api) and the OpenAPI spec generator (cmd/genspec).
//
//go:generate go run ../../cmd/genspec
package server

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
)

// New builds the chi router and Huma API. Every operation registered via
// huma.Register is automatically documented in the generated OpenAPI spec.
// To opt an endpoint OUT of documentation, register it directly on the chi
// router (like the health checks below) instead of through huma.Register.
func New() (chi.Router, huma.API) {
	router := chi.NewMux()
	api := humachi.New(router, huma.DefaultConfig("Flagon API", "0.0.0"))

	registerHealthChecks(router)

	return router, api
}

func registerHealthChecks(router chi.Router) {
	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	router.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}
