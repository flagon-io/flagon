package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Account + organization tools (server/identity.go).
func registerOrgTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "whoami",
			Description: "Get the current user (id, email) and the organizations they belong to.",
			InputSchema: schema(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "read:user",
		Operation: "get-me",
		Run: run(func(ctx context.Context, tc ToolContext, _ struct{}) (any, error) {
			user, orgs, err := svc.Me(ctx, tc.actor())
			if err != nil {
				return nil, err
			}
			return map[string]any{"user": user, "orgs": orgs}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_organizations",
			Description: "List the organizations the current user belongs to, with their slug and role.",
			InputSchema: schema(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-orgs",
		Run: run(func(ctx context.Context, tc ToolContext, _ struct{}) (any, error) {
			orgs, err := svc.ListOrgs(ctx, tc.actor())
			if err != nil {
				return nil, err
			}
			return map[string]any{"organizations": orgs}, nil
		}),
	})

	type createOrgInput struct {
		Name string `json:"name" tool:"required"`
		Slug string `json:"slug"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "create_organization",
			Description: "Create a new organization owned by the current user. The slug is derived from the name if not given.",
			InputSchema: schema(`{"type":"object","properties":{"name":{"type":"string","description":"Display name of the organization"},"slug":{"type":"string","description":"Optional URL slug; lowercase letters, numbers and dashes"}},"required":["name"],"additionalProperties":false}`),
		},
		Scope:     "admin:org",
		Operation: "create-org",
		Mutating:  true,
		Summarize: summarize(func(in createOrgInput) string {
			return fmt.Sprintf("Create organization %q", in.Name)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in createOrgInput) (any, error) {
			org, err := svc.CreateOrg(ctx, tc.actor(), in.Name, in.Slug)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organization": org}, nil
		}),
	})

	type updateOrgInput struct {
		Org  string `json:"org" tool:"required"`
		Name string `json:"name" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "update_organization",
			Description: "Rename an organization (change its display name). Org owners/admins only. The slug does not change.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"name":{"type":"string","description":"New display name"}},"required":["org","name"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "update-org",
		Mutating:  true,
		Summarize: summarize(func(in updateOrgInput) string {
			return fmt.Sprintf("Rename organization %q to %q", in.Org, in.Name)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in updateOrgInput) (any, error) {
			org, err := svc.UpdateOrg(ctx, tc.actor(), in.Org, in.Name)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organization": org}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "leave_organization",
			Description: "Leave an organization (remove the current user's own membership). The only owner cannot leave; they must transfer ownership first.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "admin:org",
		Operation: "leave-org",
		Mutating:  true,
		Summarize: summarize(func(in orgArg) string {
			return fmt.Sprintf("Leave organization %q", in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			if err := svc.LeaveOrg(ctx, tc.actor(), in.Org); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_organization",
			Description: "Delete an organization (org owners only). This is a soft delete: the organization and everything in it disappears for every member at once, its access tokens stop working, and its slug is freed. An owner can restore it within 30 days with restore_organization. Always confirm the exact org slug with the user first.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "admin:org",
		Operation: "delete-org",
		Mutating:  true,
		Summarize: summarize(func(in orgArg) string {
			return fmt.Sprintf("Delete organization %q (restorable by an owner for 30 days)", in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			org, err := svc.DeleteOrg(ctx, tc.actor(), in.Org)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organization": org, "deleted": true}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_deleted_organizations",
			Description: "List the organizations the current user owned that were deleted in the last 30 days (restorable). Each has an id to pass to restore_organization and a purge_at after which it can no longer be restored.",
			InputSchema: schema(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-deleted-orgs",
		Run: run(func(ctx context.Context, tc ToolContext, _ struct{}) (any, error) {
			orgs, err := svc.ListDeletedOrgs(ctx, tc.actor())
			if err != nil {
				return nil, err
			}
			return map[string]any{"organizations": orgs}, nil
		}),
	})

	type restoreOrgInput struct {
		ID   string `json:"id" tool:"required"`
		Slug string `json:"slug"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "restore_organization",
			Description: "Restore a deleted organization by its id (from list_deleted_organizations). Owners only, within 30 days of deletion. If its old slug was taken meanwhile, pass a new slug. Restoring counts toward the owned-organization plan limit.",
			InputSchema: schema(`{"type":"object","properties":{"id":{"type":"string","description":"The deleted organization's id"},"slug":{"type":"string","description":"Optional new slug; required when the old slug is now taken"}},"required":["id"],"additionalProperties":false}`),
		},
		Scope:     "admin:org",
		Operation: "restore-org",
		Mutating:  true,
		// Addresses the (deleted) org by id, never the conversation's org.
		CrossOrg: true,
		Summarize: summarize(func(in restoreOrgInput) string {
			if in.Slug != "" {
				return fmt.Sprintf("Restore deleted organization %s as %q", in.ID, in.Slug)
			}
			return fmt.Sprintf("Restore deleted organization %s", in.ID)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in restoreOrgInput) (any, error) {
			org, err := svc.RestoreOrg(ctx, tc.actor(), in.ID, in.Slug)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organization": org, "restored": true}, nil
		}),
	})
}
