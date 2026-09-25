package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// registerMCP mounts the MCP front door at /mcp. It speaks the Model Context
// Protocol over JSON-RPC 2.0 (Streamable HTTP transport). Anonymous callers see
// ONLY the registry's public-safe tools (documentation retrieval today), run with
// an anonymous context so internal docs never leak. A caller presenting a Flagon
// token (Authorization: Bearer flagon_...) is resolved to a user and can reach
// the user-acting tools their token's scopes allow - the same registry the REST
// API and in-product agent use, acting as that user (RLS + scopes still apply).
//
// The /mcp path is served on every host so local dev and api.flagon.io/mcp keep
// working; the dedicated public hostname (mcp.flagon.io) serves the same handler
// at the root via mcpHostGate, installed in New before any routes.
//
// Registered on the chi router directly (like the health checks), off the
// documented REST spec.
func registerMCP(router chi.Router, registry *ai.Registry, store IdentityStore) {
	if registry == nil {
		return
	}
	router.Post("/mcp", mcpHandler(registry, store))
}

// mcpCaller is the resolved identity of one MCP request. The zero value is an
// anonymous caller (public tools only); authed is set once a valid token is
// presented, carrying the user context and the token's held scopes (nil scopes
// meaning a full-access token).
type mcpCaller struct {
	tc     ai.ToolContext
	scopes []string
	authed bool
}

// canUse reports whether this caller may see and run a tool. Public tools are
// always allowed. Everything else requires authentication; a non-Public tool
// with no declared Scope is fail-closed (unreachable), a full-access token (nil
// scopes) may use any scoped tool, and a scoped token must hold the tool's scope.
func (c mcpCaller) canUse(t ai.Tool) bool {
	if t.Def.Name == "" {
		return false
	}
	if t.Public {
		return true
	}
	if !c.authed || t.Scope == "" {
		return false
	}
	if c.scopes == nil {
		return true
	}
	return scopeSatisfies(c.scopes, Scope(t.Scope))
}

// mcpHandler serves one MCP JSON-RPC request. It is POST-only (this server
// implements the Streamable HTTP transport's POST channel, not the GET/SSE one);
// any other method is a 405 so the endpoint behaves the same whether it is
// reached via the /mcp path or at the root of the MCP host.
func mcpHandler(registry *ai.Registry, store IdentityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		defer func() { _ = r.Body.Close() }()

		caller, err := authenticateMCP(r, store)
		switch {
		case errors.Is(err, errMCPInvalidToken):
			// A token was presented but did not resolve: fail loud rather than
			// silently downgrading to anonymous, so a rotated/expired token is
			// obvious instead of quietly losing access to the user's tools.
			writeJSON(w, http.StatusOK, rpcErr(nil, -32001, "invalid or expired token"))
			return
		case err != nil:
			// Not a verdict on the token (e.g. the database is down), so don't
			// tell a valid caller to discard it. Same rule as the REST combinedAuth.
			slog.ErrorContext(r.Context(), "mcp: could not resolve access token",
				"request_id", RequestID(r.Context()), "err", err)
			writeProblem(w, http.StatusServiceUnavailable, "the service is temporarily unavailable")
			return
		}

		req, err := decodeRPC(r)
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				writeProblem(w, http.StatusRequestEntityTooLarge, "request body is too large")
				return
			}
			writeJSON(w, http.StatusOK, rpcErr(nil, -32700, "parse error"))
			return
		}
		// Tools an authenticated caller runs act as their user and may write audit
		// entries; stamp the request's "where" (the connection address - MCP has no
		// trusted gateway forwarding an end-user IP - and the client's user agent)
		// so those entries record it, the same as a REST call with the same token.
		ctx := r.Context()
		if caller.authed {
			ctx = audit.WithContext(ctx, connIP(ctx), "", strings.TrimSpace(r.UserAgent()))
		}
		resp, notification := handleRPC(ctx, registry, caller, req)
		if notification {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// errMCPInvalidToken marks a presented Flagon token that is unknown, expired, or
// revoked, as opposed to a lookup that failed for another reason.
var errMCPInvalidToken = errors.New("invalid or expired token")

// authenticateMCP resolves the request's Authorization header into a caller. No
// Flagon token (missing header, or a non-flagon bearer) is an anonymous caller.
// A Flagon token that doesn't resolve returns errMCPInvalidToken so the handler
// can reject it; any other failure (the store is missing or the lookup errored)
// is returned as-is and answered with a 503. Tokens act as the user, mirroring
// the REST API's combinedAuth.
func authenticateMCP(r *http.Request, store IdentityStore) (mcpCaller, error) {
	presented := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !strings.HasPrefix(presented, "flagon_") {
		return mcpCaller{}, nil // anonymous
	}
	if store == nil {
		return mcpCaller{}, errors.New("mcp: no identity store configured")
	}
	p, err := store.ResolveToken(r.Context(), presented)
	if errors.Is(err, db.ErrInvalidToken) {
		return mcpCaller{}, errMCPInvalidToken
	}
	if err != nil {
		return mcpCaller{}, err
	}
	// An authenticated caller may read internal docs; the anonymous MCP never can.
	tc := ai.ToolContext{
		UserID:            p.UserID,
		Email:             p.Email,
		Via:               tokenVia(p.Kind),
		AllowInternalDocs: true,
	}
	if p.OrgID != nil {
		tc.OrgID = *p.OrgID
	}
	return mcpCaller{tc: tc, scopes: p.Scopes, authed: true}, nil
}

// mcpHostGate turns the dedicated MCP hostname into a single-purpose front door.
// On that host the MCP endpoint IS the site: it is served at the root (and at
// /mcp, so clients configured either way work), and every other path is a 404 so
// the public hostname never exposes the rest of the API surface (index,
// openapi.json, docs, ...). On any other host the gate is a no-op, so
// api.flagon.io and local dev keep every route, /mcp included.
//
// Installed as chi middleware, which must be registered before any routes - see
// New. Host comparison ignores the port and case (r.Host can carry :443 locally).
func mcpHostGate(host string, handler http.HandlerFunc) func(http.Handler) http.Handler {
	want := strings.ToLower(host)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !hostMatches(r.Host, want) {
				next.ServeHTTP(w, r)
				return
			}
			switch r.URL.Path {
			case "/", "/mcp":
				handler(w, r)
			default:
				http.NotFound(w, r)
			}
		})
	}
}

// hostMatches reports whether the request's Host header (which may include a
// port) equals the configured MCP host, case-insensitively.
func hostMatches(reqHost, want string) bool {
	h := strings.ToLower(reqHost)
	if i := strings.LastIndexByte(h, ':'); i >= 0 {
		h = h[:i]
	}
	return h == want
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func decodeRPC(r *http.Request) (rpcRequest, error) {
	var req rpcRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	return req, err
}

func rpcErr(id json.RawMessage, code int, msg string) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: msg}}
}

func rpcOK(id json.RawMessage, result any) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

// handleRPC dispatches one MCP method for a resolved caller. The bool return is
// true for a notification (no id): the caller sends no response body.
func handleRPC(ctx context.Context, registry *ai.Registry, caller mcpCaller, req rpcRequest) (rpcResponse, bool) {
	// Notifications (e.g. notifications/initialized) carry no id and expect no
	// reply.
	if len(req.ID) == 0 {
		return rpcResponse{}, true
	}

	switch req.Method {
	case "initialize":
		return rpcOK(req.ID, map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "flagon", "version": "0.0.0"},
		}), false

	case "ping":
		return rpcOK(req.ID, map[string]any{}), false

	case "tools/list":
		// List exactly the tools this caller may run: public tools for everyone,
		// plus the scoped tools an authenticated token holds.
		defs := registry.DefsFor(caller.canUse)
		tools := make([]map[string]any, 0, len(defs))
		for _, d := range defs {
			tools = append(tools, map[string]any{
				"name":        d.Name,
				"description": d.Description,
				"inputSchema": d.InputSchema,
			})
		}
		return rpcOK(req.ID, map[string]any{"tools": tools}), false

	case "tools/call":
		return callTool(ctx, registry, caller, req), false

	default:
		return rpcErr(req.ID, -32601, "method not found: "+req.Method), false
	}
}

func callTool(ctx context.Context, registry *ai.Registry, caller mcpCaller, req rpcRequest) rpcResponse {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return rpcErr(req.ID, -32602, "invalid params")
	}

	tool, ok := registry.Get(params.Name)
	// A tool the caller cannot even see is reported as nonexistent when they are
	// anonymous, so the public surface never hints at authenticated capabilities.
	// An authenticated caller who is merely missing a scope gets a clear reason.
	if !ok || (!caller.authed && !tool.Public) {
		return rpcErr(req.ID, -32602, "unknown tool: "+params.Name)
	}
	if !caller.canUse(tool) {
		return rpcErr(req.ID, -32003, "this token is missing the scope required for "+params.Name)
	}

	args := params.Arguments
	if len(args) == 0 {
		args = json.RawMessage(`{}`)
	}
	// Anonymous callers run with the zero ToolContext (no identity, no internal
	// docs); authenticated callers act as their user.
	out, err := tool.Run(ctx, caller.tc, args)
	if err != nil {
		// Only a classified (caller-safe) message ever leaves the server; an
		// internal fault is logged and reported generically, never as raw
		// err.Error() (which can carry SQL, hostnames, or other internals).
		if _, known := service.Classify(err); !known {
			slog.ErrorContext(ctx, "mcp tool failed", "request_id", RequestID(ctx), "tool", params.Name, "err", err)
		}
		return rpcOK(req.ID, toolResult(service.PublicMessage(err), true))
	}
	payload, err := json.Marshal(out)
	if err != nil {
		return rpcOK(req.ID, toolResult("could not encode tool result", true))
	}
	return rpcOK(req.ID, toolResult(string(payload), false))
}

// toolResult renders an MCP tool result: a single text content block plus the
// error flag, per the protocol.
func toolResult(text string, isErr bool) map[string]any {
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": text}},
		"isError": isErr,
	}
}
