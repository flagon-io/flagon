package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/service"
)

// Internal docs (visibility: internal) follow one rule with no configuration:
// the public HTTP routes and the anonymous MCP never serve them; an
// authenticated caller (the in-product assistant, or an MCP caller with a valid
// token) can read them. The public routes are covered in docs_test.go and the
// anonymous MCP in mcp_test.go (TestMCP_InternalDocHidden).

// mcpGetHandbook calls get_doc for the internal test page over /mcp with the
// given bearer ("" for anonymous) and reports whether it was served.
func mcpGetHandbook(t *testing.T, s testServer, bearer string) bool {
	t.Helper()
	rec := s.call(http.MethodPost, "/mcp", bearer,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_doc","arguments":{"slug":"handbook/pay"}}}`)
	var body struct {
		Result struct {
			IsError bool `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode mcp response: %v (%s)", err, rec.Body.String())
	}
	return !body.Result.IsError
}

func TestInternalDocs_MCPAuthenticatedOnly(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))
	if mcpGetHandbook(t, s, "") {
		t.Fatal("the anonymous MCP must not serve internal docs")
	}
	if !mcpGetHandbook(t, s, testPAT) {
		t.Fatal("an authenticated MCP caller should read internal docs")
	}
}

// docsProvider is a scripted model: its first call asks for get_doc on the
// internal test page, and it records the tool result it gets back.
type docsProvider struct {
	mu     sync.Mutex
	result *ai.Block
}

func (p *docsProvider) DefaultModel() string { return "test" }

func (p *docsProvider) Complete(_ context.Context, req ai.CompleteRequest) (ai.CompleteResponse, error) {
	if n := len(req.Messages); n > 0 {
		for _, b := range req.Messages[n-1].Blocks {
			if b.Type == "tool_result" {
				p.mu.Lock()
				got := b
				p.result = &got
				p.mu.Unlock()
				return ai.CompleteResponse{Blocks: []ai.Block{{Type: "text", Text: "done"}}, StopReason: "end_turn"}, nil
			}
		}
	}
	return ai.CompleteResponse{
		Blocks:     []ai.Block{{Type: "tool_use", ID: "t1", Name: "get_doc", Input: json.RawMessage(`{"slug":"handbook/pay"}`)}},
		StopReason: "tool_use",
	}, nil
}

func TestInternalDocs_AssistantCanRead(t *testing.T) {
	store := newFakeStore(nil)
	provider := &docsProvider{}
	registry := ai.NewRegistry(service.New(store), testDocsIndex())
	agent := ai.NewAgent(provider, registry, &fakeMeter{})
	s := newTestServer(t, store, WithAI(agent))

	rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(testOrgID))
	if rec.Code != http.StatusOK {
		t.Fatalf("assistant turn = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.result == nil {
		t.Fatal("the assistant never ran get_doc")
	}
	if provider.result.IsError || !strings.Contains(provider.result.Content, "handbook/pay") {
		t.Fatalf("the assistant should read internal docs, got: %+v", *provider.result)
	}
}
