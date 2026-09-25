package ai

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// scriptedProvider asks for the given tool calls on its first completion, then
// ends the turn, recording the tool results it was handed back.
type scriptedProvider struct {
	calls   []Block
	results []Block
	turn    int
}

func (p *scriptedProvider) DefaultModel() string { return "scripted" }
func (p *scriptedProvider) Complete(_ context.Context, req CompleteRequest) (CompleteResponse, error) {
	p.turn++
	if p.turn == 1 {
		return CompleteResponse{Blocks: p.calls, StopReason: "tool_use"}, nil
	}
	last := req.Messages[len(req.Messages)-1]
	p.results = append(p.results, last.Blocks...)
	return CompleteResponse{Blocks: []Block{{Type: "text", Text: "done"}}, StopReason: "end_turn"}, nil
}

// orgRegistry has a read tool and a mutating tool that take an org slug, plus a
// CrossOrg tool; runs counts executions.
func orgRegistry(runs *int) *Registry {
	r := &Registry{}
	body := func(context.Context, ToolContext, json.RawMessage) (any, error) {
		*runs++
		return ok(), nil
	}
	r.add(Tool{Def: ToolDef{Name: "read_thing", InputSchema: schema(`{"type":"object"}`)}, Scope: "read:org", Operation: "read-thing", Run: body})
	r.add(Tool{Def: ToolDef{Name: "write_thing", InputSchema: schema(`{"type":"object"}`)}, Scope: "write:org", Operation: "write-thing", Mutating: true, Run: body})
	r.add(Tool{Def: ToolDef{Name: "cross_thing", InputSchema: schema(`{"type":"object"}`)}, Scope: "admin:org", Operation: "cross-thing", Mutating: true, CrossOrg: true, Run: body})
	return r
}

func TestCheckOrgScope(t *testing.T) {
	var runs int
	r := orgRegistry(&runs)
	read, _ := r.Get("read_thing")
	cross, _ := r.Get("cross_thing")
	confined := ToolContext{ConfineOrg: "acme"}
	cases := []struct {
		name  string
		tc    ToolContext
		tool  Tool
		input string
		deny  bool
	}{
		{"same org", confined, read, `{"org":"acme"}`, false},
		{"same org, other case and spacing", confined, read, `{"org":" ACME "}`, false},
		{"no org argument", confined, read, `{}`, false},
		{"empty input", confined, read, ``, false},
		{"other org", confined, read, `{"org":"globex"}`, true},
		{"cross-org tool", confined, cross, `{"id":"x"}`, true},
		{"unconfined (MCP) other org", ToolContext{}, read, `{"org":"globex"}`, false},
		{"unconfined (MCP) cross-org tool", ToolContext{}, cross, `{"id":"x"}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.tc.CheckOrgScope(c.tool, json.RawMessage(c.input))
			if c.deny != (err != nil) {
				t.Fatalf("CheckOrgScope = %v, deny want %v", err, c.deny)
			}
			if c.deny && !errors.Is(err, ErrOutsideConversationOrg) {
				t.Fatalf("err = %v, want ErrOutsideConversationOrg", err)
			}
		})
	}
}

func TestRun_RefusesToolsOutsideTheConversationOrg(t *testing.T) {
	var runs int
	p := &scriptedProvider{calls: []Block{
		{Type: "tool_use", ID: "1", Name: "read_thing", Input: json.RawMessage(`{"org":"globex"}`)},
		{Type: "tool_use", ID: "2", Name: "write_thing", Input: json.RawMessage(`{"org":"globex"}`)},
		{Type: "tool_use", ID: "3", Name: "read_thing", Input: json.RawMessage(`{"org":"acme"}`)},
	}}
	a := NewAgent(p, orgRegistry(&runs), &recMeter{})
	res, err := a.Run(context.Background(), ToolContext{UserID: "u1", OrgID: "o1", ConfineOrg: "acme"}, userSays("go"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if runs != 1 {
		t.Fatalf("tool runs = %d, want 1 (only the in-org read)", runs)
	}
	if len(res.Proposals) != 0 {
		t.Fatalf("a mutation in another org must not be proposed, got %+v", res.Proposals)
	}
	if len(p.results) != 3 || !p.results[0].IsError || !p.results[1].IsError || p.results[2].IsError {
		t.Fatalf("tool results = %+v", p.results)
	}
	if !strings.Contains(p.results[0].Content, `scoped to the "acme" organization`) {
		t.Fatalf("refusal should name the conversation org, got %q", p.results[0].Content)
	}
}

// denyMeter is an org that is over its AI quota.
type denyMeter struct{ recMeter }

func (*denyMeter) Allowed(context.Context, string, string) (bool, error) { return false, nil }

func TestExecute_ChecksQuotaAndOrgBeforeRunning(t *testing.T) {
	var runs int
	r := orgRegistry(&runs)
	tc := ToolContext{UserID: "u1", OrgID: "o1", ConfineOrg: "acme"}

	a := NewAgent(NewMock(""), r, &denyMeter{})
	if _, err := a.Execute(context.Background(), tc, "write_thing", json.RawMessage(`{"org":"acme"}`)); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("over-quota Execute = %v, want ErrRateLimited", err)
	}

	a = NewAgent(NewMock(""), r, &recMeter{})
	if _, err := a.Execute(context.Background(), tc, "write_thing", json.RawMessage(`{"org":"globex"}`)); !errors.Is(err, ErrOutsideConversationOrg) {
		t.Fatalf("other-org Execute = %v, want ErrOutsideConversationOrg", err)
	}
	if _, err := a.Execute(context.Background(), tc, "cross_thing", json.RawMessage(`{"id":"x"}`)); !errors.Is(err, ErrOutsideConversationOrg) {
		t.Fatalf("cross-org Execute = %v, want ErrOutsideConversationOrg", err)
	}
	if runs != 0 {
		t.Fatalf("refused actions ran %d times", runs)
	}
	if _, err := a.Execute(context.Background(), tc, "write_thing", json.RawMessage(`{"org":"acme"}`)); err != nil || runs != 1 {
		t.Fatalf("in-org Execute = %v (runs %d)", err, runs)
	}
}
