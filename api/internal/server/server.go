// Package server wires up the chi router and Huma API used by both the
// running service (cmd/flagon-server) and the OpenAPI spec generator (cmd/genspec).
//
//go:generate go run ../../cmd/genspec
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/changelog"
	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/roadmap"
	"github.com/flagon-io/flagon/api/internal/service"
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

	// Roadmap backs the public roadmap endpoint (/roadmap). Nil disables it.
	Roadmap *roadmap.Board

	// Changelog backs the public changelog endpoint (/changelog). Nil disables it.
	Changelog *changelog.Log

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

	// Limits configures the request guards (body cap, per-principal rate limit,
	// trusted client-IP header). The zero value caps bodies at
	// DefaultMaxBodyBytes, trusts only the TCP peer address, and does not rate
	// limit; cmd/flagon-server passes its flags through WithLimits.
	Limits Limits

	// ServiceOptions configure the service every handler runs through (e.g. the
	// transactional mailer), so REST gets the same side effects as the agent/MCP
	// tools built over a service with the same options.
	ServiceOptions []service.Option

	// onOperation, when set, observes every operation as it is registered with
	// huma - including Hidden ones (the QUERY twins) that never reach the OpenAPI
	// spec. Tests use it to enumerate the real, complete operation set.
	onOperation func(huma.Operation)
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

// WithRoadmap wires the public roadmap endpoint (/roadmap) to the compiled board.
func WithRoadmap(board *roadmap.Board) Option {
	return func(o *Options) { o.Roadmap = board }
}

// WithChangelog wires the public changelog endpoint (/changelog) to the log.
func WithChangelog(log *changelog.Log) Option {
	return func(o *Options) { o.Changelog = log }
}

// WithMCP wires the public MCP front door (/mcp) to the shared tool registry.
func WithMCP(registry *ai.Registry) Option {
	return func(o *Options) { o.Registry = registry }
}

// WithAudit wires the org audit log endpoint to the audit read store.
func WithAudit(store *audit.Store) Option {
	return func(o *Options) { o.Audit = store }
}

// WithServiceOptions passes options (e.g. service.WithMailer) to the service the
// handlers run through.
func WithServiceOptions(opts ...service.Option) Option {
	return func(o *Options) { o.ServiceOptions = append(o.ServiceOptions, opts...) }
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

	// The HTTP QUERY method (RFC 9110's safe, idempotent query method) is not one
	// of chi's built-in methods, so register it before any routes. It lets list
	// endpoints accept a body-based query in addition to their GET form; see
	// registerQueryList in listing.go.
	chi.RegisterMethod("QUERY")

	router := chi.NewMux()

	// Request guards run first, ahead of every route (and the MCP host gate):
	// a request id for correlating logs with error reports, the caller's
	// resolved network address, the global body cap, then the rate limiter.
	maxBody := options.Limits.MaxBodyBytes
	if maxBody <= 0 {
		maxBody = DefaultMaxBodyBytes
	}
	router.Use(withRequestID, withConnIP(options.Limits.ClientIPHeader), withBodyLimit(maxBody))
	if options.Limits.RateLimit > 0 {
		router.Use(withRateLimit(newRateLimiter(options.Limits.RateLimit, options.Limits.RateBurst), options.InternalToken))
	}

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
	// Internal failure detail (raw error text in a 5xx problem's `errors`) is
	// logged with the request id and stripped before it reaches the client.
	config.Transformers = append(config.Transformers, redactServerErrors)
	api := humachi.New(router, config)

	// Registration goes through reg, which is api itself unless a test asked to
	// observe every registered operation. The returned api is always the real one.
	reg := api
	if options.onOperation != nil {
		reg = recordingAPI{API: api, record: options.onOperation}
	}

	// One service over the store backs every user-facing handler (and, via the
	// registry built in main, every agent/MCP tool), so the front doors share one
	// implementation of each operation.
	// Both auth middlewares also enforce the org security policy (2FA + SSO
	// requirements) on every /orgs/{slug} operation, once the caller is known.
	svc := service.New(options.Identity, options.ServiceOptions...)
	d := deps{
		svc:      svc,
		store:    options.Identity,
		auth:     withOrgPolicy(api, svc, combinedAuth(api, options.Identity, options.InternalToken)),
		internal: withOrgPolicy(api, svc, internalAuth(api, options.InternalToken)),
	}

	registerHealthChecks(router, options)
	registerIndex(router, reg)
	registerIdentityAPI(reg, d)
	registerMembersAPI(reg, d)
	registerInvitationsAPI(reg, d)
	registerProjectsAPI(reg, d)
	registerProjectMembersAPI(reg, d)
	registerProjectTeamsAPI(reg, d)
	registerTeamsAPI(reg, d)
	registerAuditAPI(reg, d, options.Audit)
	registerOrgSecurityAPI(reg, d)
	registerSSOAPI(reg, d)
	registerSSOProvidersAPI(reg, d, options.InternalToken)
	registerTokensAPI(reg, d)
	registerNotificationsAPI(reg, d)
	registerAIAPI(reg, d, options.AI)

	// Docs content and MCP are served off the documented spec, on the chi router
	// directly - like the health checks and the index. The OpenAPI spec stays the
	// product's operational contract; documentation delivery is a separate concern.
	registerDocsAPI(router, options.Docs)
	registerRoadmapAPI(router, options.Roadmap)
	registerChangelogAPI(router, options.Changelog)
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
				// The cause (hostnames, driver text) is logged, never served.
				slog.WarnContext(r.Context(), "readiness check failed", "request_id", RequestID(r.Context()), "err", err)
				body["database"] = "unavailable"
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

// recordingAPI is a huma.API whose adapter reports each operation as it is
// registered, then registers it normally. See Options.onOperation.
type recordingAPI struct {
	huma.API
	record func(huma.Operation)
}

func (r recordingAPI) Adapter() huma.Adapter {
	return recordingAdapter{Adapter: r.API.Adapter(), record: r.record}
}

type recordingAdapter struct {
	huma.Adapter
	record func(huma.Operation)
}

func (r recordingAdapter) Handle(op *huma.Operation, handler func(huma.Context)) {
	r.record(*op)
	r.Adapter.Handle(op, handler)
}
