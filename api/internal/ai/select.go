package ai

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// ErrNotConfigured is returned when the agent has no usable model behind it: a
// provider with no credentials, or one the upstream rejected as unauthorized.
// The API surfaces it as a 503 ("the AI agent is not configured"), never as an
// opaque 500.
var ErrNotConfigured = errors.New("the AI agent is not configured")

// ProviderConfig is the provider-selection config (FLAGON_AI_PROVIDER and the
// per-backend credentials).
type ProviderConfig struct {
	// Provider is auto (or empty), anthropic, openai, or mock.
	Provider           string
	Model              string
	AnthropicKey       string
	AnthropicWorkspace string
	OpenAIKey          string
	OpenAIBaseURL      string
}

// SelectProvider picks the provider from config and returns it with a label for
// logging. auto (the default) prefers Anthropic, then any configured
// OpenAI-compatible endpoint, then the offline mock, so it never fails. A
// provider pinned explicitly without its credentials is a startup error (fail
// fast with a clear message) rather than a server that 500s on every turn; an
// unknown provider name is an error too.
func SelectProvider(c ProviderConfig) (Provider, string, error) {
	name := strings.ToLower(strings.TrimSpace(c.Provider))
	switch name {
	case "anthropic":
		if strings.TrimSpace(c.AnthropicKey) == "" {
			return nil, "", fmt.Errorf("FLAGON_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY (or --anthropic-api-key); unset FLAGON_AI_PROVIDER to fall back automatically")
		}
		return NewAnthropic(c.AnthropicKey, c.AnthropicWorkspace, c.Model), "anthropic", nil
	case "openai":
		// A keyless local server (Ollama, vLLM) is valid, but then the endpoint
		// must be named: the default endpoint always needs a key.
		if strings.TrimSpace(c.OpenAIKey) == "" && strings.TrimSpace(c.OpenAIBaseURL) == "" {
			return nil, "", fmt.Errorf("FLAGON_AI_PROVIDER=openai requires FLAGON_AI_API_KEY (or OPENAI_API_KEY), or FLAGON_AI_BASE_URL for a keyless local server; unset FLAGON_AI_PROVIDER to fall back automatically")
		}
		return NewOpenAI(c.OpenAIKey, c.OpenAIBaseURL, c.Model), "openai-compatible", nil
	case "mock":
		return NewMock(c.Model), "mock", nil
	case "", "auto":
		switch {
		case c.AnthropicKey != "":
			return NewAnthropic(c.AnthropicKey, c.AnthropicWorkspace, c.Model), "anthropic", nil
		case c.OpenAIKey != "" || c.OpenAIBaseURL != "":
			return NewOpenAI(c.OpenAIKey, c.OpenAIBaseURL, c.Model), "openai-compatible", nil
		default:
			return NewMock(c.Model), "mock", nil
		}
	default:
		return nil, "", fmt.Errorf("unknown FLAGON_AI_PROVIDER %q (want auto, anthropic, openai, or mock)", c.Provider)
	}
}

// unauthorized reports whether an upstream status means the configured
// credentials were rejected: the agent is effectively not configured.
func unauthorized(status int) bool {
	return status == http.StatusUnauthorized || status == http.StatusForbidden
}
