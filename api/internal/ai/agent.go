package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Proposal is a mutating action the agent wants to take, held for the user to
// confirm before it runs (human-in-the-loop).
type Proposal struct {
	Tool    string          `json:"tool"`
	Input   json.RawMessage `json:"input"`
	Summary string          `json:"summary"`
}

// Result is the outcome of one agent turn.
type Result struct {
	Reply     string     `json:"reply"`
	Proposals []Proposal `json:"proposals"`
	Usage     Usage      `json:"usage"`
}

// Meter records and limits AI usage per organization so plans can be enforced.
type Meter interface {
	Allowed(ctx context.Context, userID, orgID string) (bool, error)
	Record(ctx context.Context, userID, orgID, model string, inTok, outTok int) error
}

// ErrRateLimited is returned when the org is over its AI usage cap.
var ErrRateLimited = errors.New("ai usage limit reached for this organization")

// ErrMeteringFailed is returned when a completed turn's usage could not be
// recorded. The turn fails closed: an unrecorded turn would not count against
// the org's quota, and unmetered AI is exactly what the quota exists to prevent.
var ErrMeteringFailed = errors.New("ai usage could not be recorded")

// ErrUnknownTool is returned by Execute for a tool that does not exist or is not
// a confirmable (Mutating) action.
var ErrUnknownTool = errors.New("unknown or non-executable tool")

// DefaultSystemPrompt is the built-in "SKILL" the agent runs with. It is a plain
// document on purpose: it can be swapped for a file at startup (WithSystemPrompt)
// so the behavior is iterable without recompiling - the low-cost, high-leverage
// tuning knob for smaller/open models, which lean on clear instructions.
const DefaultSystemPrompt = `You are Flagon's assistant, embedded in the Flagon developer platform. You help the user operate Flagon on their behalf: their organizations, projects, deployments, settings, and (as the product grows) observability and reporting.

Rules:
- You ONLY help with Flagon. If asked about anything unrelated, politely decline and steer back to what you can do in Flagon.
- Use tools to read data and to act. Tools run as the current user, so you can never do anything they aren't allowed to do.
- For questions about how Flagon works, its API, or how the company operates, search the documentation with search_docs and read pages with get_doc rather than answering from memory. Ground answers in the docs and mention the page you used.
- Read-only tools run automatically. Actions that change data are proposed to the user for confirmation; when a tool result says an action was "proposed", clearly tell the user what you intend to do and ask them to confirm - do not claim it is done.
- Be concise and concrete. Prefer doing the work with tools over describing it.`

// Option customizes an Agent at construction.
type Option func(*Agent)

// WithSystemPrompt overrides the built-in system prompt (SKILL). Empty is
// ignored, so a missing/blank file falls back to DefaultSystemPrompt.
func WithSystemPrompt(s string) Option {
	return func(a *Agent) {
		if strings.TrimSpace(s) != "" {
			a.system = s
		}
	}
}

// Agent runs a tool-using loop against a Provider.
type Agent struct {
	provider  Provider
	registry  *Registry
	meter     Meter
	system    string
	model     string
	maxTokens int
	maxIters  int
}

// NewAgent wires a provider, tool registry, and (optional) meter. Options can
// override defaults (e.g. the system prompt).
func NewAgent(p Provider, r *Registry, m Meter, opts ...Option) *Agent {
	a := &Agent{
		provider:  p,
		registry:  r,
		meter:     m,
		system:    DefaultSystemPrompt,
		model:     p.DefaultModel(),
		maxTokens: 1024,
		maxIters:  6,
	}
	for _, o := range opts {
		o(a)
	}
	return a
}

// Run executes one agent turn over the conversation history (the caller's
// messages, typically ending in a new user message). Read tools execute and
// feed back into the loop; mutating tools become proposals for confirmation.
func (a *Agent) Run(ctx context.Context, tc ToolContext, history []Message) (Result, error) {
	if a.meter != nil {
		ok, err := a.meter.Allowed(ctx, tc.UserID, tc.OrgID)
		if err != nil {
			return Result{}, err
		}
		if !ok {
			return Result{}, ErrRateLimited
		}
	}

	msgs := append([]Message{}, history...)
	var total Usage
	var proposals []Proposal
	reply := ""

	for i := 0; i < a.maxIters; i++ {
		resp, err := a.provider.Complete(ctx, CompleteRequest{
			Model:     a.model,
			System:    a.system,
			Messages:  msgs,
			Tools:     a.registry.Defs(),
			MaxTokens: a.maxTokens,
		})
		if err != nil {
			return Result{}, err
		}
		total.InputTokens += resp.Usage.InputTokens
		total.OutputTokens += resp.Usage.OutputTokens
		msgs = append(msgs, Message{Role: RoleAssistant, Blocks: resp.Blocks})
		reply = textOf(resp.Blocks)

		if resp.StopReason != "tool_use" {
			break
		}

		var results []Block
		for _, b := range resp.Blocks {
			if b.Type != "tool_use" {
				continue
			}
			tool, ok := a.registry.Get(b.Name)
			if !ok {
				results = append(results, Block{Type: "tool_result", ToolUseID: b.ID, Content: "unknown tool", IsError: true})
				continue
			}
			// A conversation is scoped (and metered) to one org: a call naming
			// another is refused before it is run or proposed.
			if err := tc.CheckOrgScope(tool, b.Input); err != nil {
				results = append(results, Block{Type: "tool_result", ToolUseID: b.ID, Content: "error: " + service.PublicMessage(err), IsError: true})
				continue
			}
			if tool.Mutating {
				summary := b.Name
				if tool.Summarize != nil {
					summary = tool.Summarize(b.Input)
				}
				proposals = append(proposals, Proposal{Tool: b.Name, Input: b.Input, Summary: summary})
				results = append(results, Block{
					Type:      "tool_result",
					ToolUseID: b.ID,
					Content:   "Proposed to the user for confirmation. Not executed. Tell the user exactly what you will do and ask them to confirm.",
				})
				continue
			}
			out, err := tool.Run(ctx, tc, b.Input)
			if err != nil {
				results = append(results, Block{Type: "tool_result", ToolUseID: b.ID, Content: "error: " + toolErrorText(ctx, b.Name, err), IsError: true})
				continue
			}
			j, _ := json.Marshal(out)
			results = append(results, Block{Type: "tool_result", ToolUseID: b.ID, Content: string(j)})
		}
		msgs = append(msgs, Message{Role: RoleUser, Blocks: results})
	}

	if a.meter != nil {
		if err := a.meter.Record(ctx, tc.UserID, tc.OrgID, a.model, total.InputTokens, total.OutputTokens); err != nil {
			slog.ErrorContext(ctx, "could not record AI usage; failing the turn closed",
				"org_id", tc.OrgID, "user_id", tc.UserID, "err", err)
			return Result{}, fmt.Errorf("%w: %w", ErrMeteringFailed, err)
		}
	}
	return Result{Reply: reply, Proposals: proposals, Usage: total}, nil
}

// Execute runs a confirmed mutating tool directly (the HITL confirm step). It
// only runs tools flagged Mutating, and acts as the requesting user, confined to
// the conversation's org (tc.ConfineOrg) when one is set. The org's quota is
// checked BEFORE the action runs (ErrRateLimited when exhausted), exactly like a
// turn. The action is metered after it succeeds; a metering failure is logged
// loudly but does not fail the response, because the mutation has already
// committed and reporting it as failed would invite a duplicate retry.
func (a *Agent) Execute(ctx context.Context, tc ToolContext, toolName string, input json.RawMessage) (any, error) {
	tool, ok := a.registry.Get(toolName)
	if !ok || !tool.Mutating {
		return nil, fmt.Errorf("%w: %s", ErrUnknownTool, toolName)
	}
	if err := tc.CheckOrgScope(tool, input); err != nil {
		return nil, err
	}
	if a.meter != nil {
		allowed, err := a.meter.Allowed(ctx, tc.UserID, tc.OrgID)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, ErrRateLimited
		}
	}
	out, err := tool.Run(ctx, tc, input)
	if err != nil {
		return nil, err
	}
	if a.meter != nil {
		if rerr := a.meter.Record(ctx, tc.UserID, tc.OrgID, "action:"+toolName, 0, 0); rerr != nil {
			slog.ErrorContext(ctx, "could not record AI action usage",
				"tool", toolName, "org_id", tc.OrgID, "user_id", tc.UserID, "err", rerr)
		}
	}
	return out, nil
}

// toolErrorText is what the model sees when a tool fails: the caller-safe
// message for a classified domain error, or a generic line for an internal
// fault (whose detail is logged, never handed to the model).
func toolErrorText(ctx context.Context, tool string, err error) string {
	if _, ok := service.Classify(err); !ok {
		slog.ErrorContext(ctx, "agent tool failed", "tool", tool, "err", err)
	}
	return service.PublicMessage(err)
}
