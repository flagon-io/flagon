package ai

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/service"
)

type fakeDocs struct{}

func (fakeDocs) Search(string, bool, int) []docs.Hit { return nil }
func (fakeDocs) Get(string, bool) (docs.Doc, bool)   { return docs.Doc{}, false }

// recMeter allows every call and records usage, or fails Record with err.
type recMeter struct {
	err     error
	records int
}

func (m *recMeter) Allowed(context.Context, string, string) (bool, error) { return true, nil }
func (m *recMeter) Record(context.Context, string, string, string, int, int) error {
	if m.err != nil {
		return m.err
	}
	m.records++
	return nil
}

// testRegistry is a registry with one read tool and one mutating tool whose
// behavior the test controls.
func testRegistry(runErr error) *Registry {
	r := &Registry{}
	r.add(Tool{
		Def:       ToolDef{Name: "do_thing", InputSchema: schema(`{"type":"object"}`)},
		Scope:     "write:org",
		Operation: "do-thing",
		Mutating:  true,
		Summarize: summarize(func(struct{}) string { return "Do the thing" }),
		Run: func(context.Context, ToolContext, json.RawMessage) (any, error) {
			if runErr != nil {
				return nil, runErr
			}
			return ok(), nil
		},
	})
	return r
}

func userSays(text string) []Message {
	return []Message{{Role: RoleUser, Blocks: []Block{{Type: "text", Text: text}}}}
}

func TestRun_MeteringFailureFailsClosed(t *testing.T) {
	meter := &recMeter{err: errors.New("usage insert rejected")}
	a := NewAgent(NewMock(""), testRegistry(nil), meter)
	_, err := a.Run(context.Background(), ToolContext{UserID: "u1", OrgID: "o1"}, userSays("hello"))
	if !errors.Is(err, ErrMeteringFailed) {
		t.Fatalf("Run with a failing meter = %v, want ErrMeteringFailed", err)
	}
}

func TestRun_RecordsUsage(t *testing.T) {
	meter := &recMeter{}
	a := NewAgent(NewMock(""), testRegistry(nil), meter)
	if _, err := a.Run(context.Background(), ToolContext{UserID: "u1", OrgID: "o1"}, userSays("hello")); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if meter.records != 1 {
		t.Fatalf("expected one usage record, got %d", meter.records)
	}
}

func TestExecute_MeteringFailureDoesNotFailCommittedAction(t *testing.T) {
	// The mutation already committed; reporting it as failed would invite a
	// duplicate retry, so a metering failure is logged, not returned.
	meter := &recMeter{err: errors.New("usage insert rejected")}
	a := NewAgent(NewMock(""), testRegistry(nil), meter)
	if _, err := a.Execute(context.Background(), ToolContext{UserID: "u1", OrgID: "o1"}, "do_thing", nil); err != nil {
		t.Fatalf("Execute should succeed despite a metering failure, got %v", err)
	}
}

func TestExecute_UnknownTool(t *testing.T) {
	a := NewAgent(NewMock(""), testRegistry(nil), nil)
	if _, err := a.Execute(context.Background(), ToolContext{}, "nope", nil); !errors.Is(err, ErrUnknownTool) {
		t.Fatalf("unknown tool = %v, want ErrUnknownTool", err)
	}
}

func TestExecute_PassesClassifiedErrors(t *testing.T) {
	want := service.Invalid("name is required")
	a := NewAgent(NewMock(""), testRegistry(want), nil)
	_, err := a.Execute(context.Background(), ToolContext{}, "do_thing", nil)
	var se *service.Error
	if !errors.As(err, &se) || se.Status != 422 {
		t.Fatalf("Execute error = %v, want the classified 422 from the tool", err)
	}
}

func TestToolErrorText_NeverLeaksInternals(t *testing.T) {
	if got := toolErrorText(context.Background(), "x", errors.New(`pq: password authentication failed for user "flagon_app"`)); got == "" || containsAny(got, "pq:", "flagon_app") {
		t.Fatalf("internal detail leaked to the model: %q", got)
	}
	if got := toolErrorText(context.Background(), "x", service.Invalid("org is required")); got != "org is required" {
		t.Fatalf("classified message = %q, want it passed through", got)
	}
}

func TestBind(t *testing.T) {
	type in struct {
		Org     string  `json:"org" tool:"required"`
		Project string  `json:"project" tool:"required"`
		UserID  string  `json:"user_id" tool:"required"`
		Name    *string `json:"name"`
	}
	got, err := bind[in](json.RawMessage(`{"org":"  acme  ","name":" keep "}`))
	if got.Org != "acme" {
		t.Errorf("strings should be trimmed, got %q", got.Org)
	}
	if got.Name == nil || *got.Name != " keep " {
		t.Errorf("pointer fields are passed through untouched for the service to normalize, got %v", got.Name)
	}
	if err == nil || err.Error() != "project and user_id are required" {
		t.Errorf("missing fields error = %v, want %q", err, "project and user_id are required")
	}
	if _, err := bind[in](json.RawMessage(`not json`)); err == nil {
		t.Error("invalid JSON should fail")
	}
	if _, err := bind[struct{}](nil); err != nil {
		t.Errorf("empty input for a no-arg tool should be fine, got %v", err)
	}
}
