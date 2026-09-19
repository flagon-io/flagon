// Package server wires up the chi router and Huma API used by both the
// running service (cmd/flagon-server) and the OpenAPI spec generator (cmd/genspec).
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

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/docs"
)

// Options configures optional server dependencies.
type Options struct {
	// ReadyCheck reports whether the service can serve real traffic - today,
	// whether Postgres is reachable. A nil check means "no dependencies", so
	// readiness is always OK. It backs /readyz, never /healthz: the process
	// stays live (and the deploy stays up) even while a dependency is down.
	ReadyCheck func(ctx context.Context) error

	// RLSCheck runs the tenant-isolation self-test as the app (RLS) role and
	// returns a JSON-serializable report plus whether isolation held. It backs
	// /internal/rls-check. Nil disables that endpoint.
	RLSCheck func(ctx context.Context) (report any, ok bool)

	// Identity backs the /me and /orgs endpoints; InternalToken is the shared
	// secret the app authenticates with. Identity may be nil during spec
	// generation (handlers never run then).
	Identity      IdentityStore
	InternalToken string

	// AI backs the /ai endpoints (the in-product agent). Nil disables them; it is
	// also nil during spec generation (handlers never run then).
	AI *ai.Agent

	// Docs backs the public documentation endpoints (/docs*). Nil disables them.
	Docs *docs.Index

	// Registry backs the public MCP server (/mcp), exposing the read-only,
	// public-safe tools. Nil disables the MCP front door.
	Registry *ai.Registry

	// Audit backs the org audit log endpoint (search + filters + pagination).
	// Nil disables the endpoint.
	Audit *audit.Store

	// MCPHost, when set (e.g. "mcp.flagon.io"), turns that hostname into a
	// dedicated MCP front door: the endpoint is served at the root and every
	// other path 404s, so the public MCP host never exposes the rest of the API.
	// Empty (local dev, spec generation) leaves the /mcp path as the only mount.
	MCPHost string
}

// Option mutates Options.
type Option func(*Options)

// WithReadyCheck wires a dependency probe (e.g. db.Ping) into /readyz.
func WithReadyCheck(check func(ctx context.Context) error) Option {
	return func(o *Options) { o.ReadyCheck = check }
}

// WithRLSCheck wires the RLS self-test (e.g. db.CheckRLS) into
// /internal/rls-check.
func WithRLSCheck(check func(ctx context.Context) (any, bool)) Option {
	return func(o *Options) { o.RLSCheck = check }
}

// WithIdentity wires the /me and /orgs endpoints to a store, authenticated with
// the given internal token (the shared app<->API secret).
func WithIdentity(store IdentityStore, internalToken string) Option {
	return func(o *Options) {
		o.Identity = store
		o.InternalToken = internalToken
	}
}

// WithAI wires the in-product agent endpoints (/ai/*).
func WithAI(agent *ai.Agent) Option {
	return func(o *Options) { o.AI = agent }
}

// WithDocs wires the public documentation endpoints (/docs*) to the corpus index.
func WithDocs(index *docs.Index) Option {
	return func(o *Options) { o.Docs = index }
}

// WithMCP wires the public MCP front door (/mcp) to the shared tool registry.
func WithMCP(registry *ai.Registry) Option {
	return func(o *Options) { o.Registry = registry }
}

// WithAudit wires the org audit log endpoint to the audit read store.
func WithAudit(store *audit.Store) Option {
	return func(o *Options) { o.Audit = store }
}

// WithMCPHost dedicates a hostname (e.g. "mcp.flagon.io") to the MCP endpoint:
// on that host the endpoint is served at the root and all other paths 404. Empty
// is a no-op (only the /mcp path is mounted). Requires WithMCP.
func WithMCPHost(host string) Option {
	return func(o *Options) { o.MCPHost = host }
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

	// The MCP host gate is middleware, so it must be installed before any routes
	// (chi requires this). On mcp.flagon.io it serves the MCP endpoint at the root
	// and 404s everything else; on every other host it is a pass-through. Only
	// active when both a registry and a host are configured.
	if options.Registry != nil && options.MCPHost != "" {
		router.Use(mcpHostGate(options.MCPHost, mcpHandler(options.Registry, options.Identity)))
	}

	// No built-in docs UI - the website renders its own from the OpenAPI spec.
	// The spec itself stays served (huma keeps /openapi.json, /openapi.yaml).
	config := huma.DefaultConfig("Flagon API", "0.0.0")
	config.DocsPath = ""
	api := humachi.New(router, config)

	registerHealthChecks(router, options)
	registerIndex(router, api)
	registerIdentityAPI(api, options.Identity, options.InternalToken)
	registerMembersAPI(api, options.Identity, options.InternalToken)
	registerInvitationsAPI(api, options.Identity, options.InternalToken)
	registerProjectsAPI(api, options.Identity, options.InternalToken)
	registerProjectMembersAPI(api, options.Identity, options.InternalToken)
	registerAuditAPI(api, options.Identity, options.Audit, options.InternalToken)
	registerOrgSecurityAPI(api, options.Identity, options.InternalToken)
	registerSSOAPI(api, options.Identity, options.InternalToken)
	registerTokensAPI(api, options.Identity, options.InternalToken)
	registerNotificationsAPI(api, options.Identity, options.InternalToken)
	registerAIAPI(api, options.AI, options.InternalToken)

	// Docs content and MCP are served off the documented spec, on the chi router
	// directly - like the health checks and the index. The OpenAPI spec stays the
	// product's operational contract; documentation delivery is a separate concern.
	registerDocsAPI(router, options.Docs)
	registerMCP(router, options.Registry, options.Identity)

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

		writeJSON(w, code, body)
	})

	// RLS self-test: proves tenant isolation is actually enforced for the app
	// role, end to end, against a live fixture table (see db.CheckRLS). 200 when
	// isolation holds, 503 otherwise. Registered off the documented spec.
	if options.RLSCheck != nil {
		router.Get("/internal/rls-check", func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			report, ok := options.RLSCheck(ctx)
			code := http.StatusOK
			if !ok {
				code = http.StatusServiceUnavailable
			}
			writeJSON(w, code, report)
		})
	}
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}
