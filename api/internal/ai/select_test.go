package ai

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSelectProvider(t *testing.T) {
	cases := []struct {
		name    string
		cfg     ProviderConfig
		label   string
		wantErr bool
	}{
		{"auto no keys falls back to mock", ProviderConfig{}, "mock", false},
		{"auto explicit falls back to mock", ProviderConfig{Provider: "auto"}, "mock", false},
		{"auto prefers anthropic", ProviderConfig{AnthropicKey: "k", OpenAIKey: "o"}, "anthropic", false},
		{"auto uses openai endpoint", ProviderConfig{OpenAIBaseURL: "http://localhost:11434/v1"}, "openai-compatible", false},
		{"pinned anthropic with key", ProviderConfig{Provider: "Anthropic", AnthropicKey: "k"}, "anthropic", false},
		{"pinned anthropic without key fails", ProviderConfig{Provider: "anthropic", OpenAIKey: "o"}, "", true},
		{"pinned openai keyless local server", ProviderConfig{Provider: "openai", OpenAIBaseURL: "http://localhost:11434/v1"}, "openai-compatible", false},
		{"pinned openai with key", ProviderConfig{Provider: "openai", OpenAIKey: "o"}, "openai-compatible", false},
		{"pinned openai without key or endpoint fails", ProviderConfig{Provider: "openai", AnthropicKey: "k"}, "", true},
		{"pinned mock", ProviderConfig{Provider: "mock", AnthropicKey: "k"}, "mock", false},
		{"unknown provider fails", ProviderConfig{Provider: "gpt"}, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, label, err := SelectProvider(tc.cfg)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("want error, got provider %q", label)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if p == nil || label != tc.label {
				t.Fatalf("got (%v, %q), want label %q", p, label, tc.label)
			}
		})
	}
}

func TestProviderMissingKeyIsNotConfigured(t *testing.T) {
	_, err := NewAnthropic("", "", "").Complete(context.Background(), CompleteRequest{})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("anthropic without a key: want ErrNotConfigured, got %v", err)
	}
}

func TestProviderUnauthorizedIsNotConfigured(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid api key"}}`))
	}))
	defer srv.Close()

	_, err := NewOpenAI("bad", srv.URL, "m").Complete(context.Background(), CompleteRequest{})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("openai 401: want ErrNotConfigured, got %v", err)
	}
}
