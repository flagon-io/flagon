package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// MockModel is the reported model id of the offline mock provider.
const MockModel = "mock"

// Mock is a deterministic, offline Provider used when no real model is
// configured. It keeps the entire agent surface working locally with zero setup:
// it does lightweight keyword intent detection to drive whatever tools are
// registered (the same "model is the brain, tools are the hands" split a small
// real model would use), and otherwise returns a generic, helpful reply. It
// never makes a network call, so `go run ./cmd/flagon-server serve` gives you a
// usable assistant even with no API keys.
type Mock struct{ model string }

// NewMock builds the offline provider. model may be empty (reports "mock").
func NewMock(model string) *Mock {
	if strings.TrimSpace(model) == "" {
		model = MockModel
	}
	return &Mock{model: model}
}

func (m *Mock) DefaultModel() string { return m.model }

func (m *Mock) Complete(_ context.Context, req CompleteRequest) (CompleteResponse, error) {
	// If the last turn carried tool results, wrap up with a summary (end_turn).
	if last := lastMessage(req.Messages); last != nil && hasToolResult(last) {
		reply := mockSummary(last)
		return CompleteResponse{
			Blocks:     []Block{{Type: "text", Text: reply}},
			StopReason: "end_turn",
			Usage:      mockUsage(req, reply),
		}, nil
	}

	// Otherwise, try to route the latest user message to a tool.
	text := latestUserText(req.Messages)
	if call := mockToolCall(text, req.Tools); call != nil {
		return CompleteResponse{
			Blocks:     []Block{*call},
			StopReason: "tool_use",
			Usage:      mockUsage(req, ""),
		}, nil
	}

	reply := mockGeneric(req.Tools)
	return CompleteResponse{
		Blocks:     []Block{{Type: "text", Text: reply}},
		StopReason: "end_turn",
		Usage:      mockUsage(req, reply),
	}, nil
}

func lastMessage(msgs []Message) *Message {
	if len(msgs) == 0 {
		return nil
	}
	return &msgs[len(msgs)-1]
}

func hasToolResult(m *Message) bool {
	for _, b := range m.Blocks {
		if b.Type == "tool_result" {
			return true
		}
	}
	return false
}

// latestUserText returns the text of the most recent user message that is not a
// tool-result carrier.
func latestUserText(msgs []Message) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role != RoleUser || hasToolResult(&msgs[i]) {
			continue
		}
		var sb strings.Builder
		for _, b := range msgs[i].Blocks {
			if b.Type == "text" {
				sb.WriteString(b.Text)
			}
		}
		return sb.String()
	}
	return ""
}

// mockToolCall picks a tool for the user's intent by simple keyword matching,
// gated on the tool actually being registered (so it stays generic as the tool
// set grows). Returns nil when nothing matches.
func mockToolCall(text string, tools []ToolDef) *Block {
	t := strings.ToLower(text)

	if containsAny(t, "create", "new ", "add ", "make ", "set up", "provision", "spin up") {
		if def, ok := findToolContains(tools, "create"); ok {
			return &Block{
				Type:  "tool_use",
				ID:    "mock_call_1",
				Name:  def.Name,
				Input: json.RawMessage(fmt.Sprintf(`{"name":%q}`, extractName(text))),
			}
		}
	}
	if containsAny(t, "list", "show", "what org", "which org", "my org", "all org", "see my", "get my") {
		if def, ok := findToolContains(tools, "list"); ok {
			return &Block{Type: "tool_use", ID: "mock_call_1", Name: def.Name, Input: json.RawMessage(`{}`)}
		}
	}
	if containsAny(t, "who am i", "whoami", "my account", "my email", "my user", "about me") {
		if def, ok := findToolContains(tools, "whoami"); ok {
			return &Block{Type: "tool_use", ID: "mock_call_1", Name: def.Name, Input: json.RawMessage(`{}`)}
		}
	}
	return nil
}

// mockSummary turns the tool results from the previous turn into a short reply.
// It distinguishes a proposed (HITL) action from actual read results.
func mockSummary(last *Message) string {
	var parts []string
	proposed := false
	for _, b := range last.Blocks {
		if b.Type != "tool_result" {
			continue
		}
		if strings.Contains(b.Content, "Proposed") {
			proposed = true
		}
		parts = append(parts, b.Content)
	}
	if proposed {
		return "I've prepared that action for you. Review the confirmation and choose Confirm to apply it."
	}
	joined := strings.Join(parts, "\n")
	if len(joined) > 800 {
		joined = joined[:800] + "\n... (truncated)"
	}
	return "Here's what I found:\n\n```json\n" + joined + "\n```"
}

func mockGeneric(tools []ToolDef) string {
	var b strings.Builder
	b.WriteString("I'm Flagon's local assistant running in offline **mock** mode - no AI model is configured, so I match on keywords instead of reasoning. ")
	b.WriteString("Try:\n\n")
	b.WriteString("- \"list my organizations\"\n")
	b.WriteString("- \"create an organization named Acme\"\n")
	b.WriteString("- \"who am I\"\n\n")
	b.WriteString("To use a real model, set `ANTHROPIC_API_KEY`, or point `FLAGON_AI_BASE_URL` at any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, OpenRouter, Together, Groq, ...).")
	return b.String()
}

// --- small helpers ----------------------------------------------------------

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func findToolContains(tools []ToolDef, needle string) (ToolDef, bool) {
	for _, d := range tools {
		if strings.Contains(strings.ToLower(d.Name), needle) {
			return d, true
		}
	}
	return ToolDef{}, false
}

// extractName pulls a name out of "... named X", "... called X", a quoted
// phrase, or falls back to a sensible default.
func extractName(text string) string {
	if q := firstQuoted(text); q != "" {
		return q
	}
	lower := strings.ToLower(text)
	for _, kw := range []string{"named ", "called ", "name ", "org "} {
		i := strings.Index(lower, kw)
		if i < 0 {
			continue
		}
		rest := strings.TrimSpace(text[i+len(kw):])
		rest = strings.TrimLeft(rest, `"'`)
		if j := strings.IndexAny(rest, ".,\n\"'"); j >= 0 {
			rest = rest[:j]
		}
		if rest = strings.TrimSpace(rest); rest != "" {
			return rest
		}
	}
	return "New Organization"
}

// firstQuoted returns the text inside the first pair of straight or curly
// double quotes, if any.
func firstQuoted(s string) string {
	for _, pair := range [][2]string{{`"`, `"`}, {"“", "”"}} {
		if i := strings.Index(s, pair[0]); i >= 0 {
			rest := s[i+len(pair[0]):]
			if j := strings.Index(rest, pair[1]); j > 0 {
				return strings.TrimSpace(rest[:j])
			}
		}
	}
	return ""
}

func estTokens(s string) int { return (len(s) + 3) / 4 }

func mockUsage(req CompleteRequest, reply string) Usage {
	in := estTokens(req.System)
	for _, m := range req.Messages {
		for _, b := range m.Blocks {
			in += estTokens(b.Text) + estTokens(b.Content)
		}
	}
	return Usage{InputTokens: in, OutputTokens: estTokens(reply)}
}
