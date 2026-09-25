package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/db"
)

// testMCPRouter wires the public MCP endpoint over the controlled corpus. The
// registry is built with a nil store: only the public docs tools are exercised
// here, and they never touch the store.
func testMCPRouter(t *testing.T) http.Handler {
	t.Helper()
	registry := ai.NewRegistry(nil, testDocsIndex())
	router, _ := New(WithMCP(registry))
	return router
}

func rpc(t *testing.T, h http.Handler, payload string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/mcp", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	var body map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
	}
	return rec.Code, body
}

func TestMCP_Initialize(t *testing.T) {
	h := testMCPRouter(t)
	_, body := rpc(t, h, `{"jsonrpc":"2.0","id":1,"method":"initialize"}`)
	result, _ := body["result"].(map[string]any)
	if result["protocolVersion"] == nil {
		t.Fatalf("initialize missing protocolVersion: %v", body)
	}
}

func TestMCP_Notification_NoBody(t *testing.T) {
	h := testMCPRouter(t)
	code, body := rpc(t, h, `{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	if code != http.StatusAccepted {
		t.Fatalf("notification should be 202, got %d", code)
	}
	if len(body) != 0 {
		t.Fatalf("notification should have no response body, got %v", body)
	}
}

func TestMCP_ToolsList_PublicOnly(t *testing.T) {
	h := testMCPRouter(t)
	_, body := rpc(t, h, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	result, _ := body["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	names := map[string]bool{}
	for _, tl := range tools {
		names[tl.(map[string]any)["name"].(string)] = true
	}
	if !names["search_docs"] || !names["get_doc"] {
		t.Fatalf("expected docs tools in list, got %v", names)
	}
	// Operational, user-acting tools must never be exposed publicly.
	if names["whoami"] || names["create_organization"] {
		t.Fatalf("non-public tool exposed over MCP: %v", names)
	}
}

func TestMCP_CallSearchDocs(t *testing.T) {
	h := testMCPRouter(t)
	_, body := rpc(t, h, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"projects"}}}`)
	result, _ := body["result"].(map[string]any)
	if result["isError"] == true {
		t.Fatalf("search_docs should succeed: %v", result)
	}
	content, _ := result["content"].([]any)
	if len(content) == 0 {
		t.Fatal("expected content in tool result")
	}
	text := content[0].(map[string]any)["text"].(string)
	if !bytes.Contains([]byte(text), []byte("platform/projects")) {
		t.Fatalf("expected projects doc in results, got: %s", text)
	}
}

func TestMCP_InternalDocHidden(t *testing.T) {
	h := testMCPRouter(t)
	// The public MCP context is anonymous, so internal docs are invisible even by
	// exact slug.
	_, body := rpc(t, h, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_doc","arguments":{"slug":"handbook/pay"}}}`)
	result, _ := body["result"].(map[string]any)
	if result["isError"] != true {
		t.Fatalf("internal doc must not be retrievable over public MCP: %v", result)
	}
}

func TestMCP_NonPublicToolRejected(t *testing.T) {
	h := testMCPRouter(t)
	_, body := rpc(t, h, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"whoami","arguments":{}}}`)
	if body["error"] == nil {
		t.Fatalf("calling a non-public tool should error, got %v", body)
	}
}

// testMCPHostRouter wires the MCP endpoint with a dedicated host gate, so
// requests can be exercised as if they arrived at mcp.flagon.io.
func testMCPHostRouter(t *testing.T) http.Handler {
	t.Helper()
	registry := ai.NewRegistry(nil, testDocsIndex())
	router, _ := New(WithMCP(registry), WithMCPHost("mcp.flagon.io"))
	return router
}

// do issues a request with an explicit host and returns the recorder.
func do(t *testing.T, h http.Handler, method, host, path, payload string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), method, path, bytes.NewBufferString(payload))
	req.Host = host
	if payload != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	h.ServeHTTP(rec, req)
	return rec
}

func TestMCP_Host_ServesAtRoot(t *testing.T) {
	h := testMCPHostRouter(t)
	// On the MCP host, POST / is the MCP endpoint - no /mcp suffix needed.
	rec := do(t, h, http.MethodPost, "mcp.flagon.io", "/", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST / on MCP host should be 200, got %d", rec.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if _, ok := body["result"].(map[string]any); !ok {
		t.Fatalf("expected a JSON-RPC result at the MCP host root, got %v", body)
	}
	// The port on the Host header must not defeat the match.
	rec = do(t, h, http.MethodPost, "mcp.flagon.io:443", "/", `{"jsonrpc":"2.0","id":1,"method":"ping"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("host with :port should still match, got %d", rec.Code)
	}
}

func TestMCP_Host_HidesOtherRoutes(t *testing.T) {
	h := testMCPHostRouter(t)
	// The MCP host is single-purpose: every non-endpoint path 404s, so the public
	// hostname never leaks the index, the spec, or docs.
	for _, path := range []string{"/openapi.json", "/docs", "/healthz"} {
		rec := do(t, h, http.MethodGet, "mcp.flagon.io", path, "")
		if rec.Code != http.StatusNotFound {
			t.Fatalf("GET %s on MCP host should 404, got %d", path, rec.Code)
		}
	}
	// The endpoint path itself is reachable but POST-only, so a GET is a 405
	// (wrong method), not a 404 - the endpoint exists, the API surface does not.
	rec := do(t, h, http.MethodGet, "mcp.flagon.io", "/", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET / on MCP host should 405 (POST-only endpoint), got %d", rec.Code)
	}
}

func TestMCP_Host_OtherHostsUnaffected(t *testing.T) {
	h := testMCPHostRouter(t)
	// api.flagon.io keeps every route: /mcp still works and the root is not gated.
	rec := do(t, h, http.MethodPost, "api.flagon.io", "/mcp", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("api host /mcp should be 200, got %d", rec.Code)
	}
	// The root on a non-MCP host is the API index (served), not a gate 404.
	rec = do(t, h, http.MethodGet, "api.flagon.io", "/", "")
	if rec.Code == http.StatusNotFound {
		t.Fatalf("api host root should not be gated to 404")
	}
}

// --- Authenticated MCP -------------------------------------------------------

// testMCPAuthedRouter wires the real server (MCP included) over the fake store,
// whose tokens resolve to a principal holding scopes, so user-acting tools run
// through the shared service layer.
func testMCPAuthedRouter(t *testing.T, scopes []string) http.Handler {
	t.Helper()
	return newTestServer(t, newFakeStore(scopes)).handler
}

// rpcAs issues a JSON-RPC request bearing the given token (empty = anonymous).
func rpcAs(t *testing.T, h http.Handler, token, payload string) map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/mcp", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	h.ServeHTTP(rec, req)
	var body map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
	}
	return body
}

func listedToolNames(body map[string]any) map[string]bool {
	names := map[string]bool{}
	result, _ := body["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	for _, tl := range tools {
		names[tl.(map[string]any)["name"].(string)] = true
	}
	return names
}

func errCode(body map[string]any) float64 {
	e, _ := body["error"].(map[string]any)
	code, _ := e["code"].(float64)
	return code
}

func TestMCP_Authed_ToolsListReflectsScopes(t *testing.T) {
	// A read:org token sees the public docs tools plus list_organizations only.
	h := testMCPAuthedRouter(t, []string{"read:org"})
	names := listedToolNames(rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if !names["search_docs"] || !names["list_organizations"] {
		t.Fatalf("read:org token should list docs + list_organizations, got %v", names)
	}
	if names["whoami"] || names["create_organization"] {
		t.Fatalf("read:org token must not list tools it lacks scope for, got %v", names)
	}
}

func TestMCP_Authed_CallAllowedTool(t *testing.T) {
	h := testMCPAuthedRouter(t, []string{"read:org"})
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_organizations","arguments":{}}}`)
	result, _ := body["result"].(map[string]any)
	if result == nil || result["isError"] == true {
		t.Fatalf("list_organizations should succeed for read:org, got %v", body)
	}
}

func TestMCP_Authed_CallMissingScope(t *testing.T) {
	// read:org does not imply read:user, so whoami is refused with a scope error.
	h := testMCPAuthedRouter(t, []string{"read:org"})
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}`)
	if errCode(body) != -32003 {
		t.Fatalf("whoami without read:user should return -32003, got %v", body)
	}
}

func TestMCP_Authed_FullAccessToken(t *testing.T) {
	// A nil-scope token is full access: it lists and can call the mutating tool.
	h := testMCPAuthedRouter(t, nil)
	names := listedToolNames(rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if !names["whoami"] || !names["create_organization"] {
		t.Fatalf("full-access token should list all tools, got %v", names)
	}
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_organization","arguments":{"name":"Acme"}}}`)
	result, _ := body["result"].(map[string]any)
	if result == nil || result["isError"] == true {
		t.Fatalf("create_organization should succeed for a full-access token, got %v", body)
	}
}

func TestMCP_InvalidToken(t *testing.T) {
	store := newFakeStore(nil)
	store.resolveErr = db.ErrInvalidToken
	router := newTestServer(t, store).handler
	body := rpcAs(t, router, "flagon_bad", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if errCode(body) != -32001 {
		t.Fatalf("an unresolvable token should return -32001, got %v", body)
	}
}

func TestMCP_Authed_ProjectTools(t *testing.T) {
	// Projects are a first-class capability, so their tools must be present and
	// scoped: read:project lists and gets, write:project creates.
	h := testMCPAuthedRouter(t, []string{"read:project"})
	names := listedToolNames(rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if !names["list_projects"] || !names["get_project"] {
		t.Fatalf("read:project should list list_projects + get_project, got %v", names)
	}
	if names["create_project"] {
		t.Fatalf("read:project must not expose create_project (needs write:project), got %v", names)
	}
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{"org":"acme"}}}`)
	if result, _ := body["result"].(map[string]any); result == nil || result["isError"] == true {
		t.Fatalf("list_projects should succeed for read:project, got %v", body)
	}
	// Creating requires the write scope.
	body = rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_project","arguments":{"org":"acme","name":"Web"}}}`)
	if errCode(body) != -32003 {
		t.Fatalf("create_project without write:project should return -32003, got %v", body)
	}
}

func TestMCP_Anonymous_UserToolHidden(t *testing.T) {
	// With no token, a user-acting tool is reported as nonexistent (not "no
	// scope"), so the public surface never hints at authenticated capabilities.
	h := testMCPAuthedRouter(t, nil)
	body := rpcAs(t, h, "", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}`)
	if errCode(body) != -32602 {
		t.Fatalf("anonymous whoami should be -32602 unknown tool, got %v", body)
	}
}

// toolErrorText extracts the text of a failed tools/call result.
func toolErrorText(t *testing.T, body map[string]any) string {
	t.Helper()
	result, _ := body["result"].(map[string]any)
	if result == nil || result["isError"] != true {
		t.Fatalf("expected a failed tool result, got %v", body)
	}
	content, _ := result["content"].([]any)
	return content[0].(map[string]any)["text"].(string)
}

func TestMCP_ToolError_ClassifiedMessage(t *testing.T) {
	// A domain failure reaches the MCP client as the same safe message the REST
	// API would give, not the raw error string.
	store := newFakeStore(nil)
	store.err = db.ErrProjectNotFound
	h := newTestServer(t, store).handler
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_project","arguments":{"org":"acme","project":"nope"}}}`)
	if got := toolErrorText(t, body); got != "project not found" {
		t.Fatalf("classified tool error = %q, want %q", got, "project not found")
	}
}

func TestMCP_ToolError_InternalDetailNotLeaked(t *testing.T) {
	// An unclassified (internal) failure must not echo its detail to the client.
	store := newFakeStore(nil)
	store.err = errors.New(`pq: connection to "db.internal:5432" refused`)
	h := newTestServer(t, store).handler
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{"org":"acme"}}}`)
	got := toolErrorText(t, body)
	if strings.Contains(got, "db.internal") || strings.Contains(got, "pq:") {
		t.Fatalf("internal error detail leaked over MCP: %q", got)
	}
}

func TestMCP_ToolValidationMessage(t *testing.T) {
	// Missing required arguments come back as a clear, caller-safe message.
	h := testMCPAuthedRouter(t, nil)
	body := rpcAs(t, h, "flagon_pat", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_project","arguments":{"org":"acme"}}}`)
	if got := toolErrorText(t, body); got != "project is required" {
		t.Fatalf("validation message = %q, want %q", got, "project is required")
	}
}

// A presented token that fails to resolve is only "invalid" when the store says
// so; any other lookup failure (the database is down) is a 503 that doesn't leak
// the cause, so a valid caller isn't told to throw its credential away.
func TestMCP_TokenResolveFailureIsNotInvalidToken(t *testing.T) {
	for _, tc := range []struct {
		name     string
		err      error
		wantCode int
		wantRPC  bool
	}{
		{"unknown, expired or revoked token", db.ErrInvalidToken, http.StatusOK, true},
		{"database error", errors.New("dial tcp 10.9.8.7:5432: connection refused"), http.StatusServiceUnavailable, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.resolveErr = tc.err
			h := mcpHandler(ai.NewRegistry(nil, testDocsIndex()), store)
			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/mcp",
				bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
			req.Header.Set("Authorization", "Bearer flagon_pat_x")
			h.ServeHTTP(rec, req)
			if rec.Code != tc.wantCode {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tc.wantCode, rec.Body.String())
			}
			body := rec.Body.String()
			if got := strings.Contains(body, "invalid or expired token"); got != tc.wantRPC {
				t.Fatalf("invalid-token error present = %v, want %v (body: %s)", got, tc.wantRPC, body)
			}
			if strings.Contains(body, "10.9.8.7") || strings.Contains(body, "connection refused") {
				t.Fatalf("the resolve error leaked to the client: %s", body)
			}
		})
	}
}
