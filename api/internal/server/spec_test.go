package server

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/service"
)

// The published spec (built with no dependencies, as cmd/genspec does) must
// contain exactly the operations the fully wired server registers. An operation
// that only registers when its store is present silently drops out of the spec
// and the generated clients.
func TestSpecMatchesWiredServer(t *testing.T) {
	raw, err := Spec()
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]struct {
			OperationID string `json:"operationId"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	spec := map[string]bool{}
	for _, methods := range doc.Paths {
		for _, op := range methods {
			if op.OperationID != "" {
				spec[op.OperationID] = true
			}
		}
	}

	store := newFakeStore(nil)
	agent := ai.NewAgent(ai.NewMock(""), ai.NewRegistry(service.New(store), nil), &fakeMeter{})
	wired := map[string]bool{}
	for _, op := range newTestServer(t, store, WithAI(agent)).ops {
		if !op.Hidden {
			wired[op.OperationID] = true
		}
	}

	var missing, extra []string
	for id := range wired {
		if !spec[id] {
			missing = append(missing, id)
		}
	}
	for id := range spec {
		if !wired[id] {
			extra = append(extra, id)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 || len(extra) > 0 {
		t.Fatalf("spec drift: missing from spec [%s], only in spec [%s]", strings.Join(missing, ", "), strings.Join(extra, ", "))
	}
	for _, id := range []string{"list-audit-log", "get-audit-config", "set-audit-config"} {
		if !spec[id] {
			t.Fatalf("spec is missing %s", id)
		}
	}
}
