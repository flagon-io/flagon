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
