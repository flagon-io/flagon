// Package ai is Flagon's model-agnostic agent layer. A Provider abstracts the
// LLM, and the Agent runs a tool-using loop over Flagon's operations. Read tools
// run automatically; mutations are proposed for human confirmation (HITL). Every
// turn is metered per organization so plans can be enforced.
//
// Providers ship for three backends, selected by config so moving off a frontier
// model is never a code change:
//   - Anthropic (Messages API) - the prod default (Haiku class).
//   - OpenAI-compatible (Chat Completions) - the lingua franca that also unlocks
//     cheaper hosted OSS (OpenRouter, Together, Groq, ...) and self-hosted models
//     (Ollama, vLLM), so you can run your own model for a flat cost.
//   - Mock - a deterministic, offline provider so the agent works locally with no
//     keys and no network.
//
// The system prompt is a swappable "SKILL" document (WithSystemPrompt): the
// cheap, high-leverage way to tune behavior, especially for smaller models.
package ai

import (
	"context"
	"encoding/json"
)

// Role is a conversation role.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// Block is a single content block within a message: text, a tool call
// (tool_use), or a tool result (tool_result).
type Block struct {
	Type string `json:"type"`

	// text
	Text string `json:"text,omitempty"`

	// tool_use (assistant asks to call a tool)
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result (we return a tool's output)
	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   string `json:"content,omitempty"`
	IsError   bool   `json:"is_error,omitempty"`
}

// Message is one turn in the conversation.
type Message struct {
	Role   Role
	Blocks []Block
}

// ToolDef describes a tool to the model (JSON Schema input).
type ToolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

// Usage is token accounting for a single completion.
type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// CompleteRequest is a single model call.
type CompleteRequest struct {
	Model     string
	System    string
	Messages  []Message
	Tools     []ToolDef
	MaxTokens int
}

// CompleteResponse is the model's reply for one call.
type CompleteResponse struct {
	Blocks     []Block
	StopReason string // "end_turn" | "tool_use" | "max_tokens" | ...
	Usage      Usage
}

// Provider is an LLM backend. Implementations must be safe for concurrent use.
type Provider interface {
	Complete(ctx context.Context, req CompleteRequest) (CompleteResponse, error)
	// DefaultModel returns the model used when a request leaves Model empty.
	DefaultModel() string
}

func textOf(blocks []Block) string {
	out := ""
	for _, b := range blocks {
		if b.Type == "text" {
			out += b.Text
		}
	}
	return out
}
