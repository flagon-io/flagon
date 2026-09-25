package server

import (
	"encoding/json"
	"fmt"
)

// Spec builds the OpenAPI document exactly the way cmd/genspec publishes it: a
// server with NO dependencies wired. Every operation must register regardless
// of its dependencies (a missing one is a 503 at request time), so this spec is
// the complete contract; see TestSpecMatchesWiredServer.
func Spec() ([]byte, error) {
	_, api := New()
	raw, err := api.OpenAPI().MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("marshal openapi spec: %w", err)
	}
	var doc json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse openapi spec: %w", err)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("format openapi spec: %w", err)
	}
	return append(out, '\n'), nil
}
