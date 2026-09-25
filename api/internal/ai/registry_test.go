package ai

import (
	"sort"
	"strings"
	"testing"
)

// wantRoster is the COMPLETE tool roster: name -> scope, with "!" appended for
// Mutating tools. The test compares the registry to it in both directions, so a
// tool that is added, removed, re-scoped, or flips between read and write fails
// here until the roster is updated on purpose. (Whether every user-facing
// operation HAS a tool, and whether each tool's scope matches its operation, is
// derived from the live server in internal/server/guardrails_test.go.)
var wantRoster = map[string]string{
	// Account + orgs.
	"whoami":                     "read:user",
	"list_organizations":         "read:org",
	"create_organization":        "admin:org!",
	"update_organization":        "write:org!",
	"leave_organization":         "admin:org!",
	"delete_organization":        "admin:org!",
	"restore_organization":       "admin:org!",
	"list_deleted_organizations": "read:org",
	// Projects.
	"list_projects":         "read:project",
	"list_deleted_projects": "read:project",
	"get_project":           "read:project",
	"create_project":        "write:project!",
	"update_project":        "write:project!",
	"delete_project":        "admin:project!",
	"restore_project":       "admin:project!",
	// Project collaborators.
	"list_project_members":    "read:project",
	"add_project_member":      "admin:project!",
	"set_project_member_role": "admin:project!",
	"remove_project_member":   "admin:project!",
	// Teams.
	"list_teams":           "read:team",
	"get_team":             "read:team",
	"create_team":          "write:team!",
	"update_team":          "write:team!",
	"delete_team":          "admin:team!",
	"list_team_members":    "read:team",
	"list_team_projects":   "read:team",
	"add_team_member":      "write:team!",
	"set_team_member_role": "write:team!",
	"remove_team_member":   "write:team!",
	// Project team grants + owners.
	"list_project_teams":    "read:project",
	"add_project_team":      "admin:project!",
	"set_project_team_role": "admin:project!",
	"remove_project_team":   "admin:project!",
	"list_project_owners":   "read:project",
	"add_project_owner":     "admin:project!",
	"remove_project_owner":  "admin:project!",
	// Members.
	"list_members":    "read:org",
	"add_member":      "write:org!",
	"set_member_role": "write:org!",
	"remove_member":   "write:org!",
	// Org security policy.
	"get_org_security": "read:org",
	"set_org_security": "write:org!",
	// SSO providers.
	"list_sso_providers":  "read:org",
	"get_sso_provider":    "read:org",
	"create_sso_provider": "write:org!",
	"update_sso_provider": "write:org!",
	"delete_sso_provider": "write:org!",
	// Invitations.
	"list_invitations":  "read:org",
	"invite_member":     "write:org!",
	"revoke_invitation": "write:org!",
	// Audit log.
	"list_audit_events": "read:org",
	"get_audit_config":  "read:org",
	"set_audit_config":  "write:org!",
	// Notifications.
	"list_notifications":          "notifications",
	"count_unread_notifications":  "notifications",
	"mark_notification_read":      "notifications!",
	"mark_notification_unread":    "notifications!",
	"mark_all_notifications_read": "notifications!",
}

// publicTools are the unauthenticated-MCP-safe tools (present only with a docs
// index).
var publicTools = []string{"search_docs", "get_doc"}

func TestRegistryRoster(t *testing.T) {
	r := NewRegistry(nil, nil) // no service/docs needed: we inspect defs, not runs

	got := map[string]string{}
	for _, tool := range r.Tools() {
		v := tool.Scope
		if tool.Mutating {
			v += "!"
		}
		got[tool.Def.Name] = v
		if tool.Public {
			t.Errorf("tool %q is user-acting and must not be Public", tool.Def.Name)
		}
		if tool.Operation == "" {
			t.Errorf("tool %q names no Operation", tool.Def.Name)
		}
		if tool.Mutating && tool.Summarize == nil {
			t.Errorf("mutating tool %q has no Summarize", tool.Def.Name)
		}
	}

	for name, want := range wantRoster {
		switch g, ok := got[name]; {
		case !ok:
			t.Errorf("missing tool %q - a capability lost its agent/MCP surface", name)
		case g != want:
			t.Errorf("tool %q = %q, want %q (scope, \"!\" = Mutating)", name, g, want)
		}
	}
	var extra []string
	for name := range got {
		if _, ok := wantRoster[name]; !ok {
			extra = append(extra, name)
		}
	}
	sort.Strings(extra)
	if len(extra) > 0 {
		t.Errorf("tools not in wantRoster (add them with their scope): %s", strings.Join(extra, ", "))
	}
}

func TestRegistryPublicDocsTools(t *testing.T) {
	r := NewRegistry(nil, fakeDocs{})
	var names []string
	for _, d := range r.PublicDefs() {
		names = append(names, d.Name)
	}
	if strings.Join(names, ",") != strings.Join(publicTools, ",") {
		t.Fatalf("public tools = %v, want %v", names, publicTools)
	}
	for _, name := range publicTools {
		tool, _ := r.Get(name)
		if tool.Scope != "" || tool.Mutating || tool.Operation != "" {
			t.Errorf("public tool %q must be unscoped, read-only, and not front an operation", name)
		}
	}
}
