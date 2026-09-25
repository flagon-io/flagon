package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// Org security policy tools (server/org_security.go).
func registerOrgSecurityTools(r *Registry, svc *service.Service) {
	policy := func(s db.OrgSecurity) map[string]any {
		return map[string]any{
			"enforce_two_factor": s.EnforceTwoFactor,
			"require_sso":        s.RequireSSO,
			"base_permission":    s.BasePermission,
		}
	}

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_org_security",
			Description: "Get an organization's security policy: whether two-factor authentication and single sign-on are required, and the member base permission.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "get-org-security",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			s, err := svc.GetOrgSecurity(ctx, tc.actor(), in.Org)
			if err != nil {
				return nil, err
			}
			return policy(s), nil
		}),
	})

	// Policy fields are pointers so an omitted field is left unchanged (partial
	// update), not reset to its zero value.
	type setInput struct {
		Org              string  `json:"org" tool:"required"`
		EnforceTwoFactor *bool   `json:"enforce_two_factor"`
		RequireSSO       *bool   `json:"require_sso"`
		BasePermission   *string `json:"base_permission"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "set_org_security",
			Description: "Update an organization's security policy. Only the fields you provide change. base_permission is one of none, read, triage, write, maintain, admin.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"enforce_two_factor":{"type":"boolean","description":"Require members to have two-factor authentication enabled"},"require_sso":{"type":"boolean","description":"Require members to sign in through the org's SSO provider"},"base_permission":{"type":"string","description":"Default project access for members","enum":["none","read","triage","write","maintain","admin"]}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "set-org-security",
		Mutating:  true,
		Summarize: summarize(func(in setInput) string {
			return fmt.Sprintf("Update security policy for %q", in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in setInput) (any, error) {
			s, err := svc.PatchOrgSecurity(ctx, tc.actor(), in.Org, service.OrgSecurityPatch{
				EnforceTwoFactor: in.EnforceTwoFactor,
				RequireSSO:       in.RequireSSO,
				BasePermission:   in.BasePermission,
			})
			if err != nil {
				return nil, err
			}
			return policy(s), nil
		}),
	})
}

// Audit log tools (server/audit.go).
func registerAuditTools(r *Registry, svc *service.Service) {
	type listInput struct {
		Org   string `json:"org" tool:"required"`
		Limit int    `json:"limit"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_audit_events",
			Description: "List an organization's audit log (who changed what), newest first. Each entry has an actor, action, summary, and time.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"limit":{"type":"integer","description":"Max entries (default 30)"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-audit-log",
		Run: run(func(ctx context.Context, tc ToolContext, in listInput) (any, error) {
			events, err := svc.ListAuditLog(ctx, tc.actor(), in.Org, in.Limit)
			if err != nil {
				return nil, err
			}
			return map[string]any{"events": events}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_audit_config",
			Description: "Get an organization's audit log configuration: whether actor IP addresses are disclosed in the log. Org owners/admins only.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "get-audit-config",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			ip, err := svc.GetAuditConfig(ctx, tc.actor(), in.Org)
			if err != nil {
				return nil, err
			}
			return map[string]any{"ip_disclosure": ip}, nil
		}),
	})

	type setConfigInput struct {
		Org          string `json:"org" tool:"required"`
		IPDisclosure *bool  `json:"ip_disclosure"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "set_audit_config",
			Description: "Turn actor IP address disclosure in an organization's audit log on or off. Org owners/admins only; the change is itself audited.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"ip_disclosure":{"type":"boolean","description":"Reveal actor IP addresses in the audit log"}},"required":["org","ip_disclosure"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "set-audit-config",
		Mutating:  true,
		Summarize: summarize(func(in setConfigInput) string {
			verb := "Hide"
			if in.IPDisclosure != nil && *in.IPDisclosure {
				verb = "Reveal"
			}
			return fmt.Sprintf("%s actor IP addresses in the audit log for %q", verb, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in setConfigInput) (any, error) {
			if in.IPDisclosure == nil {
				return nil, service.Invalid("ip_disclosure is required")
			}
			ip, err := svc.SetAuditConfig(ctx, tc.actor(), in.Org, *in.IPDisclosure)
			if err != nil {
				return nil, err
			}
			return map[string]any{"ip_disclosure": ip}, nil
		}),
	})
}
