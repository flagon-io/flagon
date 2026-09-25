package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	anthropicURL     = "https://api.anthropic.com/v1/messages"
	anthropicVersion = "2023-06-01"
	// DefaultAnthropicModel is a low-tier, cost-efficient model (Haiku class).
	DefaultAnthropicModel = "claude-haiku-4-5"
)

// Anthropic is a Provider backed by the Anthropic Messages API over plain HTTP
// (no SDK dependency, so the surface we rely on stays small and explicit).
type Anthropic struct {
	apiKey      string
	workspaceID string
	model       string
	http        *http.Client
}

// NewAnthropic builds a provider. model may be empty to use DefaultAnthropicModel.
func NewAnthropic(apiKey, workspaceID, model string) *Anthropic {
	if model == "" {
		model = DefaultAnthropicModel
	}
	return &Anthropic{
		apiKey:      apiKey,
		workspaceID: workspaceID,
		model:       model,
		http:        &http.Client{Timeout: 60 * time.Second},
	}
}

func (a *Anthropic) DefaultModel() string { return a.model }

// wire types for the Anthropic Messages API.
type antRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	System    string       `json:"system,omitempty"`
	Messages  []antMessage `json:"messages"`
	Tools     []ToolDef    `json:"tools,omitempty"`
}

type antMessage struct {
	Role    string     `json:"role"`
	Content []antBlock `json:"content"`
}

type antBlock struct {
	Type string `json:"type"`

	Text string `json:"text,omitempty"`

	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   string `json:"content,omitempty"`
	IsError   bool   `json:"is_error,omitempty"`
}

type antResponse struct {
	Content    []antBlock `json:"content"`
	StopReason string     `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (a *Anthropic) Complete(ctx context.Context, req CompleteRequest) (CompleteResponse, error) {
	if a.apiKey == "" {
		return CompleteResponse{}, fmt.Errorf("anthropic: no API key configured: %w", ErrNotConfigured)
	}

	model := req.Model
	if model == "" {
		model = a.model
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 1024
	}

	body := antRequest{
		Model:     model,
		MaxTokens: maxTokens,
		System:    req.System,
		Tools:     req.Tools,
		Messages:  toAntMessages(req.Messages),
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return CompleteResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicURL, bytes.NewReader(buf))
	if err != nil {
		return CompleteResponse{}, err
	}
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("x-api-key", a.apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := a.http.Do(httpReq)
	if err != nil {
		return CompleteResponse{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var parsed antResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return CompleteResponse{}, fmt.Errorf("anthropic: decode response (%d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode != http.StatusOK || parsed.Error != nil {
		msg := "unexpected status"
		if parsed.Error != nil {
			msg = parsed.Error.Message
		}
		if unauthorized(resp.StatusCode) {
			return CompleteResponse{}, fmt.Errorf("anthropic: %s (status %d): %w", msg, resp.StatusCode, ErrNotConfigured)
		}
		return CompleteResponse{}, fmt.Errorf("anthropic: %s (status %d)", msg, resp.StatusCode)
	}

	return CompleteResponse{
		Blocks:     fromAntBlocks(parsed.Content),
		StopReason: parsed.StopReason,
		Usage:      Usage{InputTokens: parsed.Usage.InputTokens, OutputTokens: parsed.Usage.OutputTokens},
	}, nil
}

func toAntMessages(msgs []Message) []antMessage {
	out := make([]antMessage, 0, len(msgs))
	for _, m := range msgs {
		blocks := make([]antBlock, 0, len(m.Blocks))
		for _, b := range m.Blocks {
			blocks = append(blocks, antBlock(b))
		}
		out = append(out, antMessage{Role: string(m.Role), Content: blocks})
	}
	return out
}

func fromAntBlocks(blocks []antBlock) []Block {
	out := make([]Block, 0, len(blocks))
	for _, b := range blocks {
		out = append(out, Block(b))
	}
	return out
}
