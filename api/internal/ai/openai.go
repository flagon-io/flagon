package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// DefaultOpenAIBaseURL targets OpenAI itself; point it anywhere that speaks
	// the OpenAI Chat Completions API to run a different or self-hosted model:
	// OpenRouter, Together, Groq, Fireworks, DeepInfra (cheaper hosted OSS), or a
	// local server like Ollama (http://localhost:11434/v1) or vLLM. That is the
	// whole point of this provider - the API is the lingua franca, so moving off a
	// frontier model is a config change, not a code change.
	DefaultOpenAIBaseURL = "https://api.openai.com/v1"
	// DefaultOpenAIModel is a low-cost default; override with --ai-model (e.g.
	// "llama3.2:3b" for Ollama, "qwen2.5:3b", or a hosted OSS model id).
	DefaultOpenAIModel = "gpt-4o-mini"
)

// OpenAI is a Provider backed by any OpenAI-compatible Chat Completions endpoint.
// It maps Flagon's internal (Anthropic-shaped) block model to and from OpenAI's
// messages + function-calling format, so the same agent loop drives OpenAI, a
// cheaper hosted OSS model, or a local model with no code changes.
type OpenAI struct {
	apiKey  string
	baseURL string
	model   string
	http    *http.Client
}

// NewOpenAI builds a provider. baseURL/model may be empty to use the defaults;
// apiKey may be empty for keyless local servers (e.g. Ollama).
func NewOpenAI(apiKey, baseURL, model string) *OpenAI {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultOpenAIBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultOpenAIModel
	}
	return &OpenAI{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
		http:    &http.Client{Timeout: 120 * time.Second},
	}
}

func (o *OpenAI) DefaultModel() string { return o.model }

// --- wire types (OpenAI Chat Completions) ----------------------------------

type oaiFunc struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

type oaiTool struct {
	Type     string  `json:"type"` // always "function"
	Function oaiFunc `json:"function"`
}

type oaiToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"` // "function"
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"` // a JSON string
	} `json:"function"`
}

type oaiMessage struct {
	Role       string        `json:"role"` // system | user | assistant | tool
	Content    string        `json:"content"`
	ToolCalls  []oaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
}

type oaiRequest struct {
	Model     string       `json:"model"`
	Messages  []oaiMessage `json:"messages"`
	Tools     []oaiTool    `json:"tools,omitempty"`
	MaxTokens int          `json:"max_tokens,omitempty"`
}

type oaiResponse struct {
	Choices []struct {
		FinishReason string     `json:"finish_reason"`
		Message      oaiMessage `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (o *OpenAI) Complete(ctx context.Context, req CompleteRequest) (CompleteResponse, error) {
	model := req.Model
	if model == "" {
		model = o.model
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 1024
	}

	body := oaiRequest{
		Model:     model,
		Messages:  toOAIMessages(req.System, req.Messages),
		Tools:     toOAITools(req.Tools),
		MaxTokens: maxTokens,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return CompleteResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return CompleteResponse{}, err
	}
	httpReq.Header.Set("content-type", "application/json")
	if o.apiKey != "" {
		httpReq.Header.Set("authorization", "Bearer "+o.apiKey)
	}

	resp, err := o.http.Do(httpReq)
	if err != nil {
		return CompleteResponse{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	var parsed oaiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return CompleteResponse{}, fmt.Errorf("openai: decode response (%d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode != http.StatusOK || parsed.Error != nil {
		msg := "unexpected status"
		if parsed.Error != nil {
			msg = parsed.Error.Message
		}
		if unauthorized(resp.StatusCode) {
			return CompleteResponse{}, fmt.Errorf("openai: %s (status %d): %w", msg, resp.StatusCode, ErrNotConfigured)
		}
		return CompleteResponse{}, fmt.Errorf("openai: %s (status %d)", msg, resp.StatusCode)
	}
	if len(parsed.Choices) == 0 {
		return CompleteResponse{}, fmt.Errorf("openai: response contained no choices")
	}

	choice := parsed.Choices[0]
	var blocks []Block
	if strings.TrimSpace(choice.Message.Content) != "" {
		blocks = append(blocks, Block{Type: "text", Text: choice.Message.Content})
	}
	for _, tc := range choice.Message.ToolCalls {
		args := strings.TrimSpace(tc.Function.Arguments)
		if args == "" {
			args = "{}"
		}
		blocks = append(blocks, Block{
			Type:  "tool_use",
			ID:    tc.ID,
			Name:  tc.Function.Name,
			Input: json.RawMessage(args),
		})
	}

	return CompleteResponse{
		Blocks:     blocks,
		StopReason: mapFinishReason(choice.FinishReason),
		Usage:      Usage{InputTokens: parsed.Usage.PromptTokens, OutputTokens: parsed.Usage.CompletionTokens},
	}, nil
}

// mapFinishReason normalizes OpenAI's finish_reason to our StopReason vocabulary
// (which follows Anthropic's), so the agent loop's `!= "tool_use"` check works
// uniformly across providers.
func mapFinishReason(r string) string {
	switch r {
	case "tool_calls", "function_call":
		return "tool_use"
	case "length":
		return "max_tokens"
	case "stop", "":
		return "end_turn"
	default:
		return "end_turn"
	}
}

// toOAIMessages flattens our block-structured history into OpenAI's message list.
// An assistant turn with tool calls becomes one assistant message carrying
// tool_calls; a user turn carrying tool_result blocks expands into one `tool`
// message per result (OpenAI requires each result as its own message).
func toOAIMessages(system string, msgs []Message) []oaiMessage {
	out := make([]oaiMessage, 0, len(msgs)+1)
	if strings.TrimSpace(system) != "" {
		out = append(out, oaiMessage{Role: "system", Content: system})
	}
	for _, m := range msgs {
		if m.Role == RoleAssistant {
			var text string
			var calls []oaiToolCall
			for _, b := range m.Blocks {
				switch b.Type {
				case "text":
					text += b.Text
				case "tool_use":
					var tc oaiToolCall
					tc.ID = b.ID
					tc.Type = "function"
					tc.Function.Name = b.Name
					args := strings.TrimSpace(string(b.Input))
					if args == "" {
						args = "{}"
					}
					tc.Function.Arguments = args
					calls = append(calls, tc)
				}
			}
			out = append(out, oaiMessage{Role: "assistant", Content: text, ToolCalls: calls})
			continue
		}

		// user turn: plain text and/or tool results.
		var text string
		var toolMsgs []oaiMessage
		for _, b := range m.Blocks {
			switch b.Type {
			case "text":
				text += b.Text
			case "tool_result":
				content := b.Content
				if content == "" && b.IsError {
					content = "error"
				}
				toolMsgs = append(toolMsgs, oaiMessage{Role: "tool", ToolCallID: b.ToolUseID, Content: content})
			}
		}
		if text != "" || len(toolMsgs) == 0 {
			out = append(out, oaiMessage{Role: "user", Content: text})
		}
		out = append(out, toolMsgs...)
	}
	return out
}

func toOAITools(defs []ToolDef) []oaiTool {
	if len(defs) == 0 {
		return nil
	}
	out := make([]oaiTool, 0, len(defs))
	for _, d := range defs {
		out = append(out, oaiTool{
			Type: "function",
			Function: oaiFunc{
				Name:        d.Name,
				Description: d.Description,
				Parameters:  d.InputSchema,
			},
		})
	}
	return out
}
