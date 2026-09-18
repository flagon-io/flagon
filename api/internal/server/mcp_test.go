package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
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
	req := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(payload))
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
	req := httptest.NewRequest(method, path, bytes.NewBufferString(payload))
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
