package server

import (
	"net/http"
	"strings"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/service"
)

// An agent whose provider has no usable credentials answers 503 "the AI agent
// is not configured" - the same as a server with no agent at all - never a 500.
func TestAIMessages_UnconfiguredProviderIs503(t *testing.T) {
	store := newFakeStore(nil)
	registry := ai.NewRegistry(service.New(store), nil)
	agent := ai.NewAgent(ai.NewAnthropic("", "", ""), registry, &fakeMeter{})

	for name, s := range map[string]testServer{
		"no key":   newTestServer(t, store, WithAI(agent)),
		"no agent": newTestServer(t, store),
	} {
		rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(testOrgID))
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: status = %d, want 503 (body: %s)", name, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "the AI agent is not configured") {
			t.Fatalf("%s: body = %s, want the not-configured message", name, rec.Body.String())
		}
	}
}
