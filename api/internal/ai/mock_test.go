package ai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func mockTools() []ToolDef {
	return []ToolDef{
		{Name: "whoami"},
		{Name: "list_organizations"},
		{Name: "create_organization", InputSchema: json.RawMessage(`{"type":"object"}`)},
	}
}

func userMsg(text string) Message {
	return Message{Role: RoleUser, Blocks: []Block{{Type: "text", Text: text}}}
}

func TestMockRoutesListIntent(t *testing.T) {
	m := NewMock("")
	resp, err := m.Complete(context.Background(), CompleteRequest{
		Messages: []Message{userMsg("can you list my organizations?")},
		Tools:    mockTools(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StopReason != "tool_use" {
		t.Fatalf("want tool_use, got %q", resp.StopReason)
	}
	if len(resp.Blocks) != 1 || resp.Blocks[0].Name != "list_organizations" {
		t.Fatalf("want list_organizations tool_use, got %+v", resp.Blocks)
	}
}

func TestMockRoutesCreateIntentAndExtractsName(t *testing.T) {
	m := NewMock("")
	resp, err := m.Complete(context.Background(), CompleteRequest{
		Messages: []Message{userMsg("create an organization named Acme Robotics")},
		Tools:    mockTools(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StopReason != "tool_use" || resp.Blocks[0].Name != "create_organization" {
		t.Fatalf("want create_organization tool_use, got %+v", resp.Blocks)
	}
	var in struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(resp.Blocks[0].Input, &in); err != nil {
		t.Fatal(err)
	}
	if in.Name != "Acme Robotics" {
		t.Fatalf("want name %q, got %q", "Acme Robotics", in.Name)
	}
}

func TestMockSummarizesReadResult(t *testing.T) {
	m := NewMock("")
	history := []Message{
		userMsg("list my orgs"),
		{Role: RoleAssistant, Blocks: []Block{{Type: "tool_use", ID: "1", Name: "list_organizations"}}},
		{Role: RoleUser, Blocks: []Block{{Type: "tool_result", ToolUseID: "1", Content: `{"organizations":[]}`}}},
	}
	resp, err := m.Complete(context.Background(), CompleteRequest{Messages: history, Tools: mockTools()})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StopReason != "end_turn" {
		t.Fatalf("want end_turn, got %q", resp.StopReason)
	}
	if !strings.Contains(resp.Blocks[0].Text, "Here's what I found") {
		t.Fatalf("want a summary, got %q", resp.Blocks[0].Text)
	}
}

func TestMockReportsProposedAction(t *testing.T) {
	m := NewMock("")
	history := []Message{
		userMsg("make an org called Beta"),
		{Role: RoleAssistant, Blocks: []Block{{Type: "tool_use", ID: "1", Name: "create_organization"}}},
		{Role: RoleUser, Blocks: []Block{{Type: "tool_result", ToolUseID: "1", Content: "Proposed to the user for confirmation."}}},
	}
	resp, err := m.Complete(context.Background(), CompleteRequest{Messages: history, Tools: mockTools()})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.ToLower(resp.Blocks[0].Text), "prepared") {
		t.Fatalf("want a HITL-style reply, got %q", resp.Blocks[0].Text)
	}
}

func TestMockGenericFallback(t *testing.T) {
	m := NewMock("")
	resp, err := m.Complete(context.Background(), CompleteRequest{
		Messages: []Message{userMsg("hello there")},
		Tools:    mockTools(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StopReason != "end_turn" || !strings.Contains(resp.Blocks[0].Text, "mock") {
		t.Fatalf("want the mock fallback message, got %+v", resp.Blocks)
	}
}
