package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/ai"
)

type aiChatMessage struct {
	Role    string `json:"role" enum:"user,assistant" doc:"Who sent the message"`
	Content string `json:"content" doc:"Message text"`
}

// AIMessagesInput is the request to the agent.
type AIMessagesInput struct {
	Body struct {
		OrgID    string          `json:"org_id" doc:"Organization the conversation is scoped to"`
		Messages []aiChatMessage `json:"messages" doc:"Conversation so far, ending with the new user message"`
	}
}

// AIMessagesOutput carries the agent's reply, any proposed actions, and usage.
type AIMessagesOutput struct {
	Body ai.Result
}

// AIExecuteInput confirms and runs one proposed action.
type AIExecuteInput struct {
	Body struct {
		OrgID string          `json:"org_id"`
		Tool  string          `json:"tool" doc:"The proposed tool name"`
		Input json.RawMessage `json:"input" doc:"The tool input, as proposed"`
	}
}

// AIExecuteOutput carries the result of a confirmed action.
type AIExecuteOutput struct {
	Body struct {
		Result any `json:"result"`
	}
}

// registerAIAPI wires the in-product agent endpoints. Like the identity API,
// they are gated by the internal token and act as the forwarded user. agent may
// be nil (AI disabled, or during spec generation); handlers guard for it.
func registerAIAPI(api huma.API, agent *ai.Agent, internalToken string) {
	auth := internalAuth(api, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "ai-send-message",
		Method:      http.MethodPost,
		Path:        "/ai/messages",
		Summary:     "Send a message to the Flagon agent",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *AIMessagesInput) (*AIMessagesOutput, error) {
		if agent == nil {
			return nil, huma.Error503ServiceUnavailable("the AI agent is not configured")
		}
		userID, email := identity(ctx)
		// The in-product agent acts for an authenticated org user, so it may read
		// internal docs (e.g. the handbook) that the public MCP never sees.
		tc := ai.ToolContext{UserID: userID, Email: email, OrgID: in.Body.OrgID, AllowInternalDocs: true}
		res, err := agent.Run(ctx, tc, toAIMessages(in.Body.Messages))
		switch {
		case errors.Is(err, ai.ErrRateLimited):
			return nil, huma.Error429TooManyRequests("AI usage limit reached for this organization")
		case err != nil:
			return nil, huma.Error500InternalServerError("agent error", err)
		}
		out := &AIMessagesOutput{}
		out.Body = res
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-execute-action",
		Method:      http.MethodPost,
		Path:        "/ai/actions/execute",
		Summary:     "Execute a confirmed agent action (human-in-the-loop)",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *AIExecuteInput) (*AIExecuteOutput, error) {
		if agent == nil {
			return nil, huma.Error503ServiceUnavailable("the AI agent is not configured")
		}
		userID, email := identity(ctx)
		tc := ai.ToolContext{UserID: userID, Email: email, OrgID: in.Body.OrgID}
		result, err := agent.Execute(ctx, tc, in.Body.Tool, in.Body.Input)
		if err != nil {
			return nil, huma.Error400BadRequest("could not execute action", err)
		}
		out := &AIExecuteOutput{}
		out.Body.Result = result
		return out, nil
	})
}

func toAIMessages(msgs []aiChatMessage) []ai.Message {
	out := make([]ai.Message, 0, len(msgs))
	for _, m := range msgs {
		role := ai.RoleUser
		if m.Role == "assistant" {
			role = ai.RoleAssistant
		}
		out = append(out, ai.Message{Role: role, Blocks: []ai.Block{{Type: "text", Text: m.Content}}})
	}
	return out
}
