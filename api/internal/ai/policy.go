package ai

import (
	"context"
	"encoding/json"
	"strings"
)

// policyGated wraps a tool's Run so the org security policy (2FA + SSO
// requirements, service.CheckOrgAccess) is enforced for any tool whose input
// names an org, on every front door that runs tools (the in-product agent and
// the MCP server). It is the tool runner's half of the enforcement the REST API
// applies to /orgs/{slug} operations. Anonymous callers (the public docs tools)
// and tools with no org argument pass straight through.
func (r *Registry) policyGated(run func(context.Context, ToolContext, json.RawMessage) (any, error)) func(context.Context, ToolContext, json.RawMessage) (any, error) {
	if run == nil {
		return nil
	}
	return func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
		if r.svc != nil && tc.UserID != "" {
			var arg struct {
				Org *string `json:"org"`
			}
			// Malformed input is left for the tool's own binding to report.
			if len(input) > 0 && json.Unmarshal(input, &arg) == nil && arg.Org != nil {
				if org := strings.TrimSpace(*arg.Org); org != "" {
					if err := r.svc.CheckOrgAccess(ctx, tc.actor(), org); err != nil {
						return nil, err
					}
				}
			}
		}
		return run(ctx, tc, input)
	}
}
