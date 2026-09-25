package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
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
//
// Both endpoints take the org by id in the body (it scopes metering), so each
// first proves the caller is a member of that org. Without the check a caller
// could name a foreign org: under RLS that org would count zero prior AI calls
// (so the quota check passes) and then the usage write would be rejected, which
// is an unmetered turn. A non-member org is a 404, the same answer the rest of
// the API gives for an org you can't see.
func registerAIAPI(api huma.API, d deps, agent *ai.Agent) {
	huma.Register(api, huma.Operation{
		OperationID: "ai-send-message",
		Method:      http.MethodPost,
		Path:        "/ai/messages",
		Summary:     "Send a message to the Flagon agent",
		Middlewares: huma.Middlewares{d.internal},
	}, func(ctx context.Context, in *AIMessagesInput) (*AIMessagesOutput, error) {
		if agent == nil {
			return nil, huma.Error503ServiceUnavailable("the AI agent is not configured")
		}
		a := actor(ctx)
		orgID := strings.TrimSpace(in.Body.OrgID)
		orgSlug, err := conversationOrg(ctx, d, a, orgID)
		if err != nil {
			return nil, apiErr(err, "could not verify organization membership")
		}
		// The org's security policy (2FA/SSO) applies to the agent like any other
		// org-scoped request.
		if err := d.svc.CheckOrgAccess(ctx, a, orgSlug); err != nil {
			return nil, apiErr(err, "could not verify organization access")
		}
		// The assistant acts for an authenticated user, so it may read internal
		// docs; only the public routes and the anonymous MCP never see them.
		tc := ai.ToolContext{UserID: a.UserID, Email: a.Email, OrgID: orgID, ConfineOrg: orgSlug,
			Via: a.Via, SSOProviderID: a.SSOProviderID, AllowInternalDocs: true}
		res, err := agent.Run(ctx, tc, toAIMessages(in.Body.Messages))
		switch {
		case errors.Is(err, ai.ErrRateLimited):
			return nil, huma.Error429TooManyRequests("AI usage limit reached for this organization")
		case errors.Is(err, ai.ErrNotConfigured):
			return nil, huma.Error503ServiceUnavailable("the AI agent is not configured")
		case errors.Is(err, ai.ErrMeteringFailed):
			return nil, huma.Error503ServiceUnavailable("AI usage could not be recorded; please try again")
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
		Middlewares: huma.Middlewares{d.internal},
	}, func(ctx context.Context, in *AIExecuteInput) (*AIExecuteOutput, error) {
		if agent == nil {
			return nil, huma.Error503ServiceUnavailable("the AI agent is not configured")
		}
		a := actor(ctx)
		orgID := strings.TrimSpace(in.Body.OrgID)
		orgSlug, err := conversationOrg(ctx, d, a, orgID)
		if err != nil {
			return nil, apiErr(err, "could not verify organization membership")
		}
		if err := d.svc.CheckOrgAccess(ctx, a, orgSlug); err != nil {
			return nil, apiErr(err, "could not verify organization access")
		}
		tc := ai.ToolContext{UserID: a.UserID, Email: a.Email, OrgID: orgID, ConfineOrg: orgSlug,
			Via: a.Via, SSOProviderID: a.SSOProviderID, AllowInternalDocs: true}
		result, err := agent.Execute(ctx, tc, in.Body.Tool, in.Body.Input)
		if errors.Is(err, ai.ErrUnknownTool) {
			return nil, huma.Error400BadRequest("unknown or non-executable tool: " + in.Body.Tool)
		}
		if errors.Is(err, ai.ErrRateLimited) {
			return nil, huma.Error429TooManyRequests("AI usage limit reached for this organization")
		}
		if err != nil {
			// The same classification as the REST operation the tool fronts, so a
			// confirmed action fails with its real status (403/404/409/422), not a
			// blanket 400.
			return nil, apiErr(err, "could not execute action")
		}
		out := &AIExecuteOutput{}
		out.Body.Result = result
		return out, nil
	})
}

// conversationOrg proves the caller belongs to the conversation's org (by id)
// and returns its slug. The slug confines the conversation's tools to that org
// (ai.ToolContext.ConfineOrg): usage is metered against it, so a tool call must
// not act in any other org.
func conversationOrg(ctx context.Context, d deps, a service.Actor, orgID string) (string, error) {
	if err := d.svc.RequireOrgMember(ctx, a, orgID); err != nil {
		return "", err
	}
	orgs, err := d.svc.ListOrgs(ctx, a)
	if err != nil {
		return "", err
	}
	for _, o := range orgs {
		if o.ID == orgID {
			return o.Slug, nil
		}
	}
	// A member whose org is not listed (e.g. deleted in between) cannot use it.
	return "", db.ErrNotMember
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
