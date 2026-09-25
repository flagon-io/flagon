package server

// Classic-style token scopes: resource-grouped and hierarchical. A parent scope
// implies its children (holding admin:org grants write:org and read:org), the
// same way classic tokens nest repo/admin:org scopes. A scoped token can reach
// ONLY the operations whose required scope it holds (directly or by implication)
// - fail-closed, so an operation not in the map is denied to scoped tokens.
//
// Scopes are a CEILING on top of the principal's role: a token can never exceed
// what its principal could do, and a scope only ever narrows that further. A
// token with NO scopes (nil, "Full access") is not scope-limited (still bounded
// by its role).
type Scope string

const (
	// Account.
	ScopeReadUser  Scope = "read:user"  // read your profile
	ScopeUser      Scope = "user"       // account writes; no operation needs it today (the profile mirror is internal-only). Implies read:user
	ScopeAdminUser Scope = "admin:user" // full account control incl. deletion (implies user)

	// Organization.
	ScopeReadOrg  Scope = "read:org"  // read orgs and members
	ScopeWriteOrg Scope = "write:org" // manage members and settings (implies read:org)
	ScopeAdminOrg Scope = "admin:org" // create, leave, delete and restore orgs (implies write:org)

	// Projects.
	ScopeReadProject  Scope = "read:project"  // read projects, collaborators, teams and owners
	ScopeWriteProject Scope = "write:project" // create and update projects (implies read:project)
	ScopeAdminProject Scope = "admin:project" // delete/restore, manage collaborators/teams/owners (implies write:project)

	// Teams.
	ScopeReadTeam  Scope = "read:team"  // read teams and their members
	ScopeWriteTeam Scope = "write:team" // create/edit teams and manage membership (implies read:team)
	ScopeAdminTeam Scope = "admin:team" // delete teams (implies write:team)

	// Notifications.
	ScopeNotifications Scope = "notifications" // read and manage notifications
)

// AllScopes is the selectable set (validated on input). The create UI groups
// these into a hierarchical checklist; the backend only needs the flat set plus
// the implication table below.
var AllScopes = []Scope{
	ScopeReadUser, ScopeUser, ScopeAdminUser,
	ScopeReadOrg, ScopeWriteOrg, ScopeAdminOrg,
	ScopeReadProject, ScopeWriteProject, ScopeAdminProject,
	ScopeReadTeam, ScopeWriteTeam, ScopeAdminTeam,
	ScopeNotifications,
}

// scopeImplies lists, for each parent scope, every scope it transitively grants.
// Selecting a parent covers its children, so a held admin:org satisfies any
// operation requiring write:org or read:org.
var scopeImplies = map[Scope][]Scope{
	ScopeUser:         {ScopeReadUser},
	ScopeAdminUser:    {ScopeUser, ScopeReadUser},
	ScopeWriteOrg:     {ScopeReadOrg},
	ScopeAdminOrg:     {ScopeWriteOrg, ScopeReadOrg},
	ScopeWriteProject: {ScopeReadProject},
	ScopeAdminProject: {ScopeWriteProject, ScopeReadProject},
	ScopeWriteTeam:    {ScopeReadTeam},
	ScopeAdminTeam:    {ScopeWriteTeam, ScopeReadTeam},
}

// operationScopes maps each token-reachable operation to the scope it requires.
// Operations absent here are unreachable by a scoped token (fail-closed).
// (Token-management ops use internalAuth, so tokens never reach them at all.)
// Every new operation MUST be given a scope here - permissions by default.
// guardrails_test.go enforces it: an operation that is neither scoped here nor
// documented in its unscopedOps exemption list fails CI, as does a scoped
// operation with no agent/MCP tool.
var operationScopes = map[string]Scope{
	"get-me": ScopeReadUser,
	// sync-profile is internal-only (the app gateway mirrors the auth layer's
	// profile), so it is deliberately absent: no token scope reaches it.
	// admin:user is reserved for destructive account operations (e.g. deleting
	// your own account). That flow lives in the app today; when it becomes a
	// token-reachable API operation it maps here to ScopeAdminUser.
	"list-orgs":         ScopeReadOrg,
	"list-members":      ScopeReadOrg,
	"query-members":     ScopeReadOrg,
	"update-org":        ScopeWriteOrg,
	"add-member":        ScopeWriteOrg,
	"set-member-role":   ScopeWriteOrg,
	"remove-member":     ScopeWriteOrg,
	"list-invitations":  ScopeReadOrg,
	"query-invitations": ScopeReadOrg,
	"list-audit-log":    ScopeReadOrg,
	"get-audit-config":  ScopeReadOrg,
	"set-audit-config":  ScopeWriteOrg,
	"get-org-security":  ScopeReadOrg,
	"set-org-security":  ScopeWriteOrg,
	// SSO provider configuration is part of the org security settings (the store
	// also requires an owner/admin role); secrets are never returned on reads.
	"list-sso-providers":  ScopeReadOrg,
	"get-sso-provider":    ScopeReadOrg,
	"create-sso-provider": ScopeWriteOrg,
	"update-sso-provider": ScopeWriteOrg,
	"delete-sso-provider": ScopeWriteOrg,
	"invite-member":       ScopeWriteOrg,
	"revoke-invitation":   ScopeWriteOrg,
	// get-invitation is public (no auth) and accept-invitation is internal-only
	// (the app triggers it post-registration), so neither is token-reachable.
	"create-org":                 ScopeAdminOrg,
	"leave-org":                  ScopeAdminOrg,
	"delete-org":                 ScopeAdminOrg,
	"list-deleted-orgs":          ScopeReadOrg,
	"restore-org":                ScopeAdminOrg,
	"list-projects":              ScopeReadProject,
	"query-projects":             ScopeReadProject,
	"list-deleted-projects":      ScopeReadProject,
	"query-deleted-projects":     ScopeReadProject,
	"get-project":                ScopeReadProject,
	"create-project":             ScopeWriteProject,
	"update-project":             ScopeWriteProject,
	"delete-project":             ScopeAdminProject,
	"restore-project":            ScopeAdminProject,
	"list-project-members":       ScopeReadProject,
	"query-project-members":      ScopeReadProject,
	"add-project-member":         ScopeAdminProject,
	"set-project-member-role":    ScopeAdminProject,
	"remove-project-member":      ScopeAdminProject,
	"list-project-teams":         ScopeReadProject,
	"query-project-teams":        ScopeReadProject,
	"add-project-team":           ScopeAdminProject,
	"set-project-team-role":      ScopeAdminProject,
	"remove-project-team":        ScopeAdminProject,
	"list-project-owners":        ScopeReadProject,
	"query-project-owners":       ScopeReadProject,
	"add-project-owner":          ScopeAdminProject,
	"remove-project-owner":       ScopeAdminProject,
	"list-teams":                 ScopeReadTeam,
	"query-teams":                ScopeReadTeam,
	"get-team":                   ScopeReadTeam,
	"create-team":                ScopeWriteTeam,
	"update-team":                ScopeWriteTeam,
	"delete-team":                ScopeAdminTeam,
	"list-team-members":          ScopeReadTeam,
	"query-team-members":         ScopeReadTeam,
	"list-team-projects":         ScopeReadTeam,
	"query-team-projects":        ScopeReadTeam,
	"add-team-member":            ScopeWriteTeam,
	"set-team-member-role":       ScopeWriteTeam,
	"remove-team-member":         ScopeWriteTeam,
	"list-notifications":         ScopeNotifications,
	"notifications-unread-count": ScopeNotifications,
	"read-notification":          ScopeNotifications,
	"unread-notification":        ScopeNotifications,
	"read-all-notifications":     ScopeNotifications,
}

// scopeAllows reports whether a scoped token (holding `held`) may invoke the
// operation. A held scope satisfies the requirement if it equals the required
// scope or implies it. Fail-closed: an unmapped operation is denied.
func scopeAllows(held []string, opID string) bool {
	required, mapped := operationScopes[opID]
	if !mapped {
		return false
	}
	return scopeSatisfies(held, required)
}

// scopeSatisfies reports whether a set of held scopes covers a required scope,
// honoring the implication table (a held parent grants its children). It is the
// core check behind both operation scoping (scopeAllows) and MCP tool scoping.
func scopeSatisfies(held []string, required Scope) bool {
	for _, h := range held {
		hs := Scope(h)
		if hs == required {
			return true
		}
		for _, imp := range scopeImplies[hs] {
			if imp == required {
				return true
			}
		}
	}
	return false
}

// validScope reports whether s is a known selectable scope.
func validScope(s string) bool {
	for _, sc := range AllScopes {
		if Scope(s) == sc {
			return true
		}
	}
	return false
}
