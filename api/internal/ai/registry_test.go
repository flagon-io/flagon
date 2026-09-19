package ai

import "testing"

// TestRegistryRoster locks the tool roster and its scope tagging. Every
// user-facing capability must have a tool (AGENTS.md golden path step 2), and
// each tool must carry the same scope as its API operation. When you add a
// capability, add it here too - a failure means a tool went missing or lost its
// scope, which silently blinds the agent and MCP to that capability.
func TestRegistryRoster(t *testing.T) {
	r := NewRegistry(nil, nil) // no store/docs needed: we inspect defs, not runs

	want := map[string]string{
		// Account + orgs.
		"whoami":              "read:user",
		"list_organizations":  "read:org",
		"create_organization": "admin:org",
		// Projects.
		"list_projects":   "read:project",
		"get_project":     "read:project",
		"create_project":  "write:project",
		"update_project":  "write:project",
		"delete_project":  "admin:project",
		"restore_project": "admin:project",
		// Project access (collaborators).
		"list_project_members":    "read:project",
		"add_project_member":      "admin:project",
		"set_project_member_role": "admin:project",
		"remove_project_member":   "admin:project",
		// Members.
		"list_members":    "read:org",
		"add_member":      "write:org",
		"set_member_role": "write:org",
		"remove_member":   "write:org",
		// Org security policy.
		"get_org_security": "read:org",
		"set_org_security": "write:org",
		// Invitations.
		"list_invitations":  "read:org",
		"invite_member":     "write:org",
		"revoke_invitation": "write:org",
		// Audit log.
		"list_audit_events": "read:org",
		// Notifications.
		"list_notifications":          "notifications",
		"mark_notification_read":      "notifications",
		"mark_all_notifications_read": "notifications",
	}

	for name, scope := range want {
		tool, ok := r.Get(name)
		if !ok {
			t.Errorf("missing tool %q - a capability lost its agent/MCP surface", name)
			continue
		}
		if tool.Scope != scope {
			t.Errorf("tool %q has scope %q, want %q", name, tool.Scope, scope)
		}
		if tool.Public {
			t.Errorf("tool %q is user-acting and must not be Public", name)
		}
	}

	// The mutating tools must be flagged so they are proposed (HITL), never
	// auto-run, on the in-product agent.
	for _, name := range []string{
		"create_organization",
		"create_project", "update_project", "delete_project", "restore_project",
		"add_project_member", "set_project_member_role", "remove_project_member",
		"add_member", "set_member_role", "remove_member",
		"set_org_security",
		"invite_member", "revoke_invitation",
		"mark_notification_read", "mark_all_notifications_read",
	} {
		if tool, ok := r.Get(name); ok && !tool.Mutating {
			t.Errorf("tool %q writes data and must be marked Mutating", name)
		}
	}
}
