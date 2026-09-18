package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestOpenAIRoundTrip drives the provider against a stub server and asserts both
// directions of the mapping: our block history -> OpenAI messages/tools on the
// way out, and OpenAI's tool_calls -> our blocks on the way back.
func TestOpenAIRoundTrip(t *testing.T) {
	var got oaiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer test-key" {
			t.Errorf("missing/incorrect auth header: %q", r.Header.Get("authorization"))
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = io.WriteString(w, `{
			"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":"working on it",
				"tool_calls":[{"id":"call_9","type":"function","function":{"name":"list_organizations","arguments":"{}"}}]}}],
			"usage":{"prompt_tokens":11,"completion_tokens":7}
		}`)
	}))
	defer srv.Close()

	p := NewOpenAI("test-key", srv.URL, "test-model")

	// A history exercising every block kind: user text, an assistant tool_use,
	// and a user tool_result (which must flatten to a `tool` role message).
	history := []Message{
		{Role: RoleUser, Blocks: []Block{{Type: "text", Text: "list my orgs"}}},
		{Role: RoleAssistant, Blocks: []Block{{Type: "tool_use", ID: "call_1", Name: "list_organizations", Input: json.RawMessage(`{}`)}}},
		{Role: RoleUser, Blocks: []Block{{Type: "tool_result", ToolUseID: "call_1", Content: `{"organizations":[]}`}}},
	}
	resp, err := p.Complete(context.Background(), CompleteRequest{
		System:   "be helpful",
		Messages: history,
		Tools:    []ToolDef{{Name: "list_organizations", Description: "list orgs", InputSchema: json.RawMessage(`{"type":"object"}`)}},
	})
	if err != nil {
		t.Fatal(err)
	}

	// --- outbound mapping ---
	if len(got.Messages) != 4 {
		t.Fatalf("want 4 outbound messages (system,user,assistant,tool), got %d: %+v", len(got.Messages), got.Messages)
	}
	if got.Messages[0].Role != "system" || got.Messages[0].Content != "be helpful" {
		t.Errorf("first message should be the system prompt, got %+v", got.Messages[0])
	}
	if got.Messages[2].Role != "assistant" || len(got.Messages[2].ToolCalls) != 1 {
		t.Errorf("assistant message should carry one tool_call, got %+v", got.Messages[2])
	}
	if got.Messages[3].Role != "tool" || got.Messages[3].ToolCallID != "call_1" {
		t.Errorf("tool_result should flatten to a tool message with tool_call_id, got %+v", got.Messages[3])
	}
	if len(got.Tools) != 1 || got.Tools[0].Type != "function" || got.Tools[0].Function.Name != "list_organizations" {
		t.Errorf("tool should map to an OpenAI function tool, got %+v", got.Tools)
	}

	// --- inbound mapping ---
	if resp.StopReason != "tool_use" {
		t.Errorf("finish_reason tool_calls should map to tool_use, got %q", resp.StopReason)
	}
	if len(resp.Blocks) != 2 || resp.Blocks[0].Type != "text" || resp.Blocks[1].Type != "tool_use" {
		t.Fatalf("want [text, tool_use] blocks, got %+v", resp.Blocks)
	}
	if resp.Blocks[1].Name != "list_organizations" || resp.Blocks[1].ID != "call_9" {
		t.Errorf("tool_use block mismapped: %+v", resp.Blocks[1])
	}
	if resp.Usage.InputTokens != 11 || resp.Usage.OutputTokens != 7 {
		t.Errorf("usage mismapped: %+v", resp.Usage)
	}
}

func TestOpenAIErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"message":"bad key","type":"auth"}}`)
	}))
	defer srv.Close()

	p := NewOpenAI("nope", srv.URL, "m")
	_, err := p.Complete(context.Background(), CompleteRequest{Messages: []Message{{Role: RoleUser, Blocks: []Block{{Type: "text", Text: "hi"}}}}})
	if err == nil {
		t.Fatal("want an error for a non-200 response")
	}
}

func TestMapFinishReason(t *testing.T) {
	cases := map[string]string{"tool_calls": "tool_use", "length": "max_tokens", "stop": "end_turn", "": "end_turn", "weird": "end_turn"}
	for in, want := range cases {
		if got := mapFinishReason(in); got != want {
			t.Errorf("mapFinishReason(%q) = %q, want %q", in, got, want)
		}
	}
}
