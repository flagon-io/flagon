package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// DocsIndex is the documentation retrieval surface the docs tools query. It is
// satisfied by *docs.Index and kept as an interface so the registry can be built
// without a corpus (nil) in tests and degraded boots.
type DocsIndex interface {
	Search(query string, includeInternal bool, limit int) []docs.Hit
	Get(slug string, includeInternal bool) (docs.Doc, bool)
}

// Store is the domain surface the agent's tools act on. It is deliberately the
// same operations the HTTP API exposes, so the agent can never do anything the
// user couldn't do themselves (identity + RLS still apply).
type Store interface {
	Me(ctx context.Context, userID, email string) (db.User, []db.Org, error)
	ListOrgs(ctx context.Context, userID string) ([]db.Org, error)
	CreateOrg(ctx context.Context, userID, email, name, slug string) (db.Org, error)

	ListProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Project, string, error)
	ListDeletedProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Project, string, error)
	GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (db.Project, error)
	CreateProject(ctx context.Context, actorID, orgSlug string, in db.ProjectInput) (db.Project, error)
	UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in db.ProjectUpdate) (db.Project, error)
	SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (db.Project, error)

	ListProjectMembers(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectMember, string, error)
	AddProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, login, role string) (targetID string, err error)
	SetProjectMemberRole(ctx context.Context, actorID, orgSlug, projectSlug, targetID, role string) error
	RemoveProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, targetID string) error

	ListTeams(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Team, string, error)
	GetTeam(ctx context.Context, actorID, orgSlug, teamSlug string) (db.Team, error)
	CreateTeam(ctx context.Context, actorID, orgSlug string, in db.TeamInput) (db.Team, error)
	UpdateTeam(ctx context.Context, actorID, orgSlug, teamSlug string, in db.TeamUpdate) (db.Team, error)
	DeleteTeam(ctx context.Context, actorID, orgSlug, teamSlug string) error
	ListTeamMembers(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamMember, string, error)
	ListTeamProjects(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamProject, string, error)
	AddTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, login, role string) (targetID string, err error)
	SetTeamMemberRole(ctx context.Context, actorID, orgSlug, teamSlug, targetID, role string) error
	RemoveTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, targetID string) error

	ListProjectTeams(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectTeam, string, error)
	AddProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error
	SetProjectTeamRole(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error
	RemoveProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug string) error

	ListProjectOwners(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectOwner, string, error)
	AddProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, login string) (principalID string, err error)
	RemoveProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, principalID string) error

	ListMembers(ctx context.Context, actorID, slug string, q paginate.Query) ([]db.Member, string, error)
	AddMember(ctx context.Context, actorID, slug, login, role string) (targetID, orgName string, err error)
	SetMemberRole(ctx context.Context, actorID, slug, targetID, newRole string) error
	RemoveMember(ctx context.Context, actorID, slug, targetID string) error

	GetOrgSecurity(ctx context.Context, actorID, slug string) (db.OrgSecurity, error)
	SetOrgSecurity(ctx context.Context, actorID, slug string, s db.OrgSecurity) error

	ListInvitations(ctx context.Context, actorID, slug string, q paginate.Query) ([]db.Invitation, string, error)
	InviteMember(ctx context.Context, actorID, slug, login, role string) (db.InviteResult, error)
	RevokeInvitation(ctx context.Context, actorID, slug, id string) error

	ListNotifications(ctx context.Context, userID string, limit int) ([]db.Notification, error)
	MarkNotificationRead(ctx context.Context, userID, id string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error

	ListAuditLog(ctx context.Context, actorID, orgSlug string, limit int) ([]db.AuditEvent, error)
}

// ToolContext carries the acting user's identity into a tool run.
type ToolContext struct {
	UserID string
	Email  string
	OrgID  string
	// AllowInternalDocs is true when the caller is an authenticated user (the
	// in-product agent), so internal documentation may be surfaced. The public
	// MCP front door leaves it false, keeping internal docs inside the org.
	AllowInternalDocs bool
}

// Tool is one capability exposed to the model.
type Tool struct {
	Def ToolDef
	// Mutating tools are never auto-run; they are proposed for confirmation.
	Mutating bool
	// Public marks a tool as safe to expose on the unauthenticated MCP front
	// door: read-only and touching no tenant data. Operational tools that act as
	// a user are never Public; they require the authenticated surfaces.
	Public bool
	// Scope is the token scope a caller must hold to run this tool over an
	// authenticated surface (the same vocabulary as the REST API's per-operation
	// scopes, e.g. "read:org", "admin:org"). Empty means the tool carries no
	// scope: Public tools need none, and a non-Public tool with an empty Scope is
	// fail-closed - unreachable by a scoped token. Enforcement lives in the
	// server (the ai package holds the value, not the scope hierarchy).
	Scope string
	// Summarize renders a short human sentence describing a proposed call.
	Summarize func(input json.RawMessage) string
	// Run executes the tool as the acting user.
	Run func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error)
}

// PublicDefs returns the definitions of tools safe for the unauthenticated MCP
// front door, in registration order.
func (r *Registry) PublicDefs() []ToolDef {
	defs := make([]ToolDef, 0, len(r.order))
	for _, name := range r.order {
		if r.byName[name].Public {
			defs = append(defs, r.byName[name].Def)
		}
	}
	return defs
}

// Registry holds the tools available to the agent + MCP server.
type Registry struct {
	byName map[string]Tool
	order  []string
}

// Defs returns the tool definitions in registration order.
func (r *Registry) Defs() []ToolDef {
	defs := make([]ToolDef, 0, len(r.order))
	for _, name := range r.order {
		defs = append(defs, r.byName[name].Def)
	}
	return defs
}

// Get looks up a tool by name.
func (r *Registry) Get(name string) (Tool, bool) {
	t, ok := r.byName[name]
	return t, ok
}

// DefsFor returns the definitions of the tools the predicate accepts, in
// registration order. The caller (e.g. the MCP server) supplies the access rule
// - Public vs. authenticated scope - so the registry stays unaware of the scope
// hierarchy while still doing the iteration.
func (r *Registry) DefsFor(allow func(Tool) bool) []ToolDef {
	defs := make([]ToolDef, 0, len(r.order))
	for _, name := range r.order {
		if t := r.byName[name]; allow(t) {
			defs = append(defs, t.Def)
		}
	}
	return defs
}

func (r *Registry) add(t Tool) {
	if r.byName == nil {
		r.byName = map[string]Tool{}
	}
	r.byName[t.Def.Name] = t
	r.order = append(r.order, t.Def.Name)
}

// NewRegistry builds the Flagon tool set bound to a store and (optionally) the
// documentation index. Add new tools here as the API grows - the same registry
// drives the in-product agent, the MCP server, and (indirectly) the REST API.
//
// A nil docs index simply omits the documentation tools, which keeps the agent
// usable in tests and in degraded boots.
func NewRegistry(store Store, docsIdx DocsIndex) *Registry {
	r := &Registry{}

	r.add(Tool{
		Def: ToolDef{
			Name:        "whoami",
			Description: "Get the current user (id, email) and the organizations they belong to.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope: "read:user",
		Run: func(ctx context.Context, tc ToolContext, _ json.RawMessage) (any, error) {
			user, orgs, err := store.Me(ctx, tc.UserID, tc.Email)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user": user, "orgs": orgs}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_organizations",
			Description: "List the organizations the current user belongs to, with their slug and role.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope: "read:org",
		Run: func(ctx context.Context, tc ToolContext, _ json.RawMessage) (any, error) {
			orgs, err := store.ListOrgs(ctx, tc.UserID)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organizations": orgs}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "create_organization",
			Description: "Create a new organization owned by the current user. The slug is derived from the name if not given.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"name":{"type":"string","description":"Display name of the organization"},"slug":{"type":"string","description":"Optional URL slug; lowercase letters, numbers and dashes"}},"required":["name"],"additionalProperties":false}`),
		},
		Scope:    "admin:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in createOrgInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Create organization %q", strings.TrimSpace(in.Name))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in createOrgInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			name := strings.TrimSpace(in.Name)
			if name == "" {
				return nil, fmt.Errorf("name is required")
			}
			slug := strings.TrimSpace(in.Slug)
			if slug == "" {
				slug = slugify(name)
			}
			org, err := store.CreateOrg(ctx, tc.UserID, tc.Email, name, slug)
			if err != nil {
				return nil, err
			}
			return map[string]any{"organization": org}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_projects",
			Description: "List the projects in an organization by its slug. Optionally filter by a search term (name or slug); pass cursor to page through results (next_cursor from a prior call).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"q":{"type":"string","description":"Optional search term matched against project name and slug"},"cursor":{"type":"string","description":"Optional pagination cursor from a previous result's next_cursor"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			projects, next, err := store.ListProjects(ctx, tc.UserID, org,
				paginate.Query{Q: strings.TrimSpace(in.Q), Cursor: strings.TrimSpace(in.Cursor), Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects, "next_cursor": next}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_deleted_projects",
			Description: "List an organization's soft-deleted projects (the restore archive). Use restore_project to bring one back. Org owners/admins only.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			projects, _, err := store.ListDeletedProjects(ctx, tc.UserID, org, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_project",
			Description: "Get a single project in an organization by the org slug and project slug.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			project := strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			p, err := store.GetProject(ctx, tc.UserID, org, project)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "create_project",
			Description: "Create a project in an organization. The slug is derived from the name if not given.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"name":{"type":"string","description":"Display name of the project"},"slug":{"type":"string","description":"Optional URL slug; lowercase letters, numbers and dashes"},"description":{"type":"string","description":"Short description"},"repository_url":{"type":"string","description":"Optional source repository URL"}},"required":["org","name"],"additionalProperties":false}`),
		},
		Scope:    "write:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in createProjectInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Create project %q in %q", strings.TrimSpace(in.Name), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in createProjectInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			name := strings.TrimSpace(in.Name)
			if org == "" || name == "" {
				return nil, fmt.Errorf("org and name are required")
			}
			slug := strings.TrimSpace(in.Slug)
			if slug == "" {
				slug = slugify(name)
			}
			p, err := store.CreateProject(ctx, tc.UserID, org, db.ProjectInput{
				Name:          name,
				Slug:          slug,
				Description:   strings.TrimSpace(in.Description),
				RepositoryURL: strings.TrimSpace(in.RepositoryURL),
			})
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "update_project",
			Description: "Update a project's fields. Only the fields you provide change; omit the rest. Setting slug renames the project.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Current project slug"},"name":{"type":"string","description":"New display name"},"slug":{"type":"string","description":"New URL slug (renames the project)"},"description":{"type":"string","description":"New one-line summary"},"readme":{"type":"string","description":"New markdown README"},"repository_url":{"type":"string","description":"New source repository URL"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:    "write:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in updateProjectInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Update project %q in %q", strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in updateProjectInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			update := db.ProjectUpdate{Description: in.Description, Readme: in.Readme, RepositoryURL: in.RepositoryURL}
			if in.Name != nil {
				name := strings.TrimSpace(*in.Name)
				if name == "" {
					return nil, fmt.Errorf("name cannot be empty")
				}
				update.Name = &name
			}
			if in.Slug != nil {
				slug := slugify(*in.Slug)
				if slug == "" {
					return nil, fmt.Errorf("slug must contain a letter or digit")
				}
				update.Slug = &slug
			}
			p, err := store.UpdateProject(ctx, tc.UserID, org, project, update)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_project",
			Description: "Delete a project. This is a soft delete: the project is restorable and its slug is freed for reuse.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectQueryInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Delete project %q in %q", strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			p, err := store.SetProjectDeleted(ctx, tc.UserID, org, project, true)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p, "deleted": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "restore_project",
			Description: "Restore a soft-deleted project by slug. Fails if another live project has since taken that slug.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectQueryInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Restore project %q in %q", strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			p, err := store.SetProjectDeleted(ctx, tc.UserID, org, project, false)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p, "restored": true}, nil
		},
	})

	// Project access -----------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_members",
			Description: "List a project's explicit collaborators and their repository-style roles (read, triage, write, maintain, admin). Org owners/admins have admin on every project implicitly and may not appear here.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectMemberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			members, _, err := store.ListProjectMembers(ctx, tc.UserID, org, project, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_member",
			Description: "Grant an existing org member a role on a project (read, triage, write, maintain, or admin). A grant only elevates the member on this project; it never lowers their org-level access.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"login":{"type":"string","description":"Username or email of an existing org member"},"role":{"type":"string","description":"Role: read, triage, write, maintain, or admin"}},"required":["org","project","login","role"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectMemberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Grant %q %s on project %q in %q", strings.TrimSpace(in.Login), strings.TrimSpace(in.Role), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectMemberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			login, role := strings.TrimSpace(in.Login), strings.TrimSpace(in.Role)
			if org == "" || project == "" || login == "" || role == "" {
				return nil, fmt.Errorf("org, project, login and role are required")
			}
			targetID, err := store.AddProjectMember(ctx, tc.UserID, org, project, login, role)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_project_member_role",
			Description: "Change a collaborator's role on a project. Identify the collaborator by their user id (from list_project_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"user_id":{"type":"string","description":"The collaborator's user id"},"role":{"type":"string","description":"New role: read, triage, write, maintain, or admin"}},"required":["org","project","user_id","role"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectMemberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Set role of %q on project %q in %q to %s", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org), strings.TrimSpace(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectMemberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			userID, role := strings.TrimSpace(in.UserID), strings.TrimSpace(in.Role)
			if org == "" || project == "" || userID == "" || role == "" {
				return nil, fmt.Errorf("org, project, user_id and role are required")
			}
			if err := store.SetProjectMemberRole(ctx, tc.UserID, org, project, userID, role); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_member",
			Description: "Revoke a collaborator's role on a project, dropping them back to their org-level access. Identify the collaborator by their user id (from list_project_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"user_id":{"type":"string","description":"The collaborator's user id"}},"required":["org","project","user_id"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectMemberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Revoke %q on project %q in %q", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectMemberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			userID := strings.TrimSpace(in.UserID)
			if org == "" || project == "" || userID == "" {
				return nil, fmt.Errorf("org, project and user_id are required")
			}
			if err := store.RemoveProjectMember(ctx, tc.UserID, org, project, userID); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	// Teams --------------------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_teams",
			Description: "List an organization's teams (named groups of members) with their member counts.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:team",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			teams, _, err := store.ListTeams(ctx, tc.UserID, org, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"teams": teams}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_team",
			Description: "Get one team in an organization by its slug.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope: "read:team",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			if org == "" || team == "" {
				return nil, fmt.Errorf("org and team are required")
			}
			t, err := store.GetTeam(ctx, tc.UserID, org, team)
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "create_team",
			Description: "Create a team in an organization. The slug is derived from the name if not given. The creator becomes the team's first maintainer.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"name":{"type":"string","description":"Team name"},"slug":{"type":"string","description":"Optional slug; derived from the name when omitted"},"description":{"type":"string","description":"Optional one-line summary"}},"required":["org","name"],"additionalProperties":false}`),
		},
		Scope:    "write:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			name := ""
			if in.Name != nil {
				name = *in.Name
			}
			return fmt.Sprintf("Create team %q in %q", name, strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			name := ""
			if in.Name != nil {
				name = strings.TrimSpace(*in.Name)
			}
			if org == "" || name == "" {
				return nil, fmt.Errorf("org and name are required")
			}
			slug := name
			if in.Slug != nil && strings.TrimSpace(*in.Slug) != "" {
				slug = strings.TrimSpace(*in.Slug)
			}
			desc := ""
			if in.Description != nil {
				desc = strings.TrimSpace(*in.Description)
			}
			t, err := store.CreateTeam(ctx, tc.UserID, org, db.TeamInput{Name: name, Slug: slugify(slug), Description: desc})
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "update_team",
			Description: "Update a team's name, slug (renames it), or description. Only the fields you pass change.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:    "write:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Update team %q in %q", strings.TrimSpace(in.Team), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			if org == "" || team == "" {
				return nil, fmt.Errorf("org and team are required")
			}
			update := db.TeamUpdate{Name: in.Name, Description: in.Description}
			if in.Slug != nil {
				s := slugify(*in.Slug)
				update.Slug = &s
			}
			t, err := store.UpdateTeam(ctx, tc.UserID, org, team, update)
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_team",
			Description: "Delete a team. Its project grants and ownerships stop having effect. Org owners/admins only.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:    "admin:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Delete team %q in %q", strings.TrimSpace(in.Team), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			if org == "" || team == "" {
				return nil, fmt.Errorf("org and team are required")
			}
			if err := store.DeleteTeam(ctx, tc.UserID, org, team); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_team_members",
			Description: "List a team's members and their team roles (maintainer or member).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope: "read:team",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			if org == "" || team == "" {
				return nil, fmt.Errorf("org and team are required")
			}
			members, _, err := store.ListTeamMembers(ctx, tc.UserID, org, team, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_team_projects",
			Description: "List the projects a team has access to and the repository-style role granted to the team on each.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope: "read:team",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			if org == "" || team == "" {
				return nil, fmt.Errorf("org and team are required")
			}
			projects, _, err := store.ListTeamProjects(ctx, tc.UserID, org, team, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "add_team_member",
			Description: "Add an existing org member to a team as a maintainer or member.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"login":{"type":"string","description":"Username or email of an existing org member"},"role":{"type":"string","description":"Team role: maintainer or member"}},"required":["org","team","login","role"],"additionalProperties":false}`),
		},
		Scope:    "write:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Add %q to team %q in %q as %s", strings.TrimSpace(in.Login), strings.TrimSpace(in.Team), strings.TrimSpace(in.Org), strings.TrimSpace(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			login, role := strings.TrimSpace(in.Login), strings.TrimSpace(in.Role)
			if org == "" || team == "" || login == "" || role == "" {
				return nil, fmt.Errorf("org, team, login and role are required")
			}
			targetID, err := store.AddTeamMember(ctx, tc.UserID, org, team, login, role)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_team_member_role",
			Description: "Change a team member's role (maintainer or member). Identify them by user id (from list_team_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"user_id":{"type":"string","description":"The member's user id"},"role":{"type":"string","description":"New role: maintainer or member"}},"required":["org","team","user_id","role"],"additionalProperties":false}`),
		},
		Scope:    "write:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Set role of %q on team %q in %q to %s", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Team), strings.TrimSpace(in.Org), strings.TrimSpace(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			userID, role := strings.TrimSpace(in.UserID), strings.TrimSpace(in.Role)
			if org == "" || team == "" || userID == "" || role == "" {
				return nil, fmt.Errorf("org, team, user_id and role are required")
			}
			if err := store.SetTeamMemberRole(ctx, tc.UserID, org, team, userID, role); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_team_member",
			Description: "Remove a member from a team. Identify them by user id (from list_team_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"user_id":{"type":"string","description":"The member's user id"}},"required":["org","team","user_id"],"additionalProperties":false}`),
		},
		Scope:    "write:team",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in teamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Remove %q from team %q in %q", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Team), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in teamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, team := strings.TrimSpace(in.Org), strings.TrimSpace(in.Team)
			userID := strings.TrimSpace(in.UserID)
			if org == "" || team == "" || userID == "" {
				return nil, fmt.Errorf("org, team and user_id are required")
			}
			if err := store.RemoveTeamMember(ctx, tc.UserID, org, team, userID); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	// Project teams & owners ----------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_teams",
			Description: "List the teams granted access to a project and their repository-style roles.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectTeamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			teams, _, err := store.ListProjectTeams(ctx, tc.UserID, org, project, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"teams": teams}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_team",
			Description: "Grant a team a repository-style role on a project (read, triage, write, maintain, or admin). Every member of the team inherits that access on the project.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"},"role":{"type":"string","description":"Role: read, triage, write, maintain, or admin"}},"required":["org","project","team","role"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectTeamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Grant team %q %s on project %q in %q", strings.TrimSpace(in.Team), strings.TrimSpace(in.Role), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectTeamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			team, role := strings.TrimSpace(in.Team), strings.TrimSpace(in.Role)
			if org == "" || project == "" || team == "" || role == "" {
				return nil, fmt.Errorf("org, project, team and role are required")
			}
			if err := store.AddProjectTeam(ctx, tc.UserID, org, project, team, role); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_project_team_role",
			Description: "Change a team's role on a project.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"},"role":{"type":"string","description":"New role: read, triage, write, maintain, or admin"}},"required":["org","project","team","role"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectTeamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Set team %q role on project %q in %q to %s", strings.TrimSpace(in.Team), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org), strings.TrimSpace(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectTeamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			team, role := strings.TrimSpace(in.Team), strings.TrimSpace(in.Role)
			if org == "" || project == "" || team == "" || role == "" {
				return nil, fmt.Errorf("org, project, team and role are required")
			}
			if err := store.SetProjectTeamRole(ctx, tc.UserID, org, project, team, role); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_team",
			Description: "Revoke a team's access to a project.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","project","team"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectTeamInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Revoke team %q on project %q in %q", strings.TrimSpace(in.Team), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectTeamInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			team := strings.TrimSpace(in.Team)
			if org == "" || project == "" || team == "" {
				return nil, fmt.Errorf("org, project and team are required")
			}
			if err := store.RemoveProjectTeam(ctx, tc.UserID, org, project, team); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_owners",
			Description: "List a project's owners (individual users and teams). Owners are a tier above admin: they can delete/transfer the project and manage its owners.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope: "read:project",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectOwnerInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			if org == "" || project == "" {
				return nil, fmt.Errorf("org and project are required")
			}
			owners, _, err := store.ListProjectOwners(ctx, tc.UserID, org, project, paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"owners": owners}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_owner",
			Description: "Make a user or a team an owner of a project (the tier above admin). For a user owner, login is an org member's username/email; for a team owner, login is the team slug.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"type":{"type":"string","description":"Owner kind: user or team"},"login":{"type":"string","description":"For a user owner: an org member's username/email. For a team owner: the team slug."}},"required":["org","project","type","login"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectOwnerInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Make %s %q an owner of project %q in %q", strings.TrimSpace(in.Type), strings.TrimSpace(in.Login), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectOwnerInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			ownerType, login := strings.TrimSpace(in.Type), strings.TrimSpace(in.Login)
			if org == "" || project == "" || ownerType == "" || login == "" {
				return nil, fmt.Errorf("org, project, type and login are required")
			}
			principalID, err := store.AddProjectOwner(ctx, tc.UserID, org, project, ownerType, login)
			if err != nil {
				return nil, err
			}
			return map[string]any{"principal_id": principalID}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_owner",
			Description: "Remove an owner (user or team) from a project. Identify them by the principal id and type from list_project_owners.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"type":{"type":"string","description":"Owner kind: user or team"},"principal_id":{"type":"string","description":"The owner's user id (user) or team id (team)"}},"required":["org","project","type","principal_id"],"additionalProperties":false}`),
		},
		Scope:    "admin:project",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in projectOwnerInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Remove %s owner %q from project %q in %q", strings.TrimSpace(in.Type), strings.TrimSpace(in.PrincipalID), strings.TrimSpace(in.Project), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in projectOwnerInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, project := strings.TrimSpace(in.Org), strings.TrimSpace(in.Project)
			ownerType, principalID := strings.TrimSpace(in.Type), strings.TrimSpace(in.PrincipalID)
			if org == "" || project == "" || ownerType == "" || principalID == "" {
				return nil, fmt.Errorf("org, project, type and principal_id are required")
			}
			if err := store.RemoveProjectOwner(ctx, tc.UserID, org, project, ownerType, principalID); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	// Members ------------------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_members",
			Description: "List the members of an organization, with their role.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:org",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in orgScopedInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			if strings.TrimSpace(in.Org) == "" {
				return nil, fmt.Errorf("org is required")
			}
			members, _, err := store.ListMembers(ctx, tc.UserID, strings.TrimSpace(in.Org), paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "add_member",
			Description: "Add an existing Flagon user to an organization by their username or email. Use invite_member for someone without an account.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"login":{"type":"string","description":"Username or email of an existing user"},"role":{"type":"string","description":"Role: member (default), admin, or owner"}},"required":["org","login"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in memberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Add %q to %q as %s", strings.TrimSpace(in.Login), strings.TrimSpace(in.Org), roleOrDefault(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in memberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, login := strings.TrimSpace(in.Org), strings.TrimSpace(in.Login)
			if org == "" || login == "" {
				return nil, fmt.Errorf("org and login are required")
			}
			targetID, orgName, err := store.AddMember(ctx, tc.UserID, org, login, roleOrDefault(in.Role))
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID, "organization": orgName}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_member_role",
			Description: "Change a member's role in an organization. Identify the member by their user id (from list_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"user_id":{"type":"string","description":"The member's user id"},"role":{"type":"string","description":"New role: member, admin, or owner"}},"required":["org","user_id","role"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in memberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Set role of %q in %q to %s", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Org), strings.TrimSpace(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in memberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, userID, role := strings.TrimSpace(in.Org), strings.TrimSpace(in.UserID), strings.TrimSpace(in.Role)
			if org == "" || userID == "" || role == "" {
				return nil, fmt.Errorf("org, user_id and role are required")
			}
			if err := store.SetMemberRole(ctx, tc.UserID, org, userID, role); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_member",
			Description: "Remove a member from an organization. Identify the member by their user id (from list_members).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"user_id":{"type":"string","description":"The member's user id"}},"required":["org","user_id"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in memberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Remove %q from %q", strings.TrimSpace(in.UserID), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in memberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, userID := strings.TrimSpace(in.Org), strings.TrimSpace(in.UserID)
			if org == "" || userID == "" {
				return nil, fmt.Errorf("org and user_id are required")
			}
			if err := store.RemoveMember(ctx, tc.UserID, org, userID); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	// Org security policy ------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_org_security",
			Description: "Get an organization's security policy: whether two-factor authentication and single sign-on are required, and the member base permission.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:org",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in orgScopedInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			s, err := store.GetOrgSecurity(ctx, tc.UserID, org)
			if err != nil {
				return nil, err
			}
			return map[string]any{
				"enforce_two_factor": s.EnforceTwoFactor,
				"require_sso":        s.RequireSSO,
				"base_permission":    s.BasePermission,
			}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_org_security",
			Description: "Update an organization's security policy. Only the fields you provide change. base_permission is one of none, read, triage, write, maintain, admin.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"enforce_two_factor":{"type":"boolean","description":"Require members to have two-factor authentication enabled"},"require_sso":{"type":"boolean","description":"Require members to sign in through the org's SSO provider"},"base_permission":{"type":"string","description":"Default project access for members","enum":["none","read","triage","write","maintain","admin"]}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in orgSecurityInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Update security policy for %q", strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in orgSecurityInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			// Merge onto the current policy so an omitted field is left unchanged,
			// matching the app gateway's partial-update behavior.
			s, err := store.GetOrgSecurity(ctx, tc.UserID, org)
			if err != nil {
				return nil, err
			}
			if in.EnforceTwoFactor != nil {
				s.EnforceTwoFactor = *in.EnforceTwoFactor
			}
			if in.RequireSSO != nil {
				s.RequireSSO = *in.RequireSSO
			}
			if in.BasePermission != nil {
				s.BasePermission = strings.TrimSpace(*in.BasePermission)
			}
			if err := store.SetOrgSecurity(ctx, tc.UserID, org, s); err != nil {
				return nil, err
			}
			return map[string]any{
				"enforce_two_factor": s.EnforceTwoFactor,
				"require_sso":        s.RequireSSO,
				"base_permission":    s.BasePermission,
			}, nil
		},
	})

	// Invitations --------------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_invitations",
			Description: "List the pending invitations for an organization.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:org",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in orgScopedInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			if strings.TrimSpace(in.Org) == "" {
				return nil, fmt.Errorf("org is required")
			}
			invites, _, err := store.ListInvitations(ctx, tc.UserID, strings.TrimSpace(in.Org), paginate.Query{Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"invitations": invites}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "invite_member",
			Description: "Invite someone to an organization by email. If they already have a Flagon account they are added directly; otherwise an email invitation is sent.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"email":{"type":"string","description":"Email address to invite"},"role":{"type":"string","description":"Role: member (default), admin, or owner"}},"required":["org","email"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in memberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Invite %q to %q as %s", strings.TrimSpace(in.Email), strings.TrimSpace(in.Org), roleOrDefault(in.Role))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in memberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, email := strings.TrimSpace(in.Org), strings.TrimSpace(in.Email)
			if org == "" || email == "" {
				return nil, fmt.Errorf("org and email are required")
			}
			res, err := store.InviteMember(ctx, tc.UserID, org, email, roleOrDefault(in.Role))
			if err != nil {
				return nil, err
			}
			// Never surface the plaintext invite token to the model; the API delivers
			// it out of band (email).
			return map[string]any{"status": res.Status, "organization": res.OrgName, "email": res.Email}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "revoke_invitation",
			Description: "Revoke a pending invitation by its id (from list_invitations).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"id":{"type":"string","description":"Invitation id"}},"required":["org","id"],"additionalProperties":false}`),
		},
		Scope:    "write:org",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in memberInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Revoke invitation %q in %q", strings.TrimSpace(in.ID), strings.TrimSpace(in.Org))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in memberInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org, id := strings.TrimSpace(in.Org), strings.TrimSpace(in.ID)
			if org == "" || id == "" {
				return nil, fmt.Errorf("org and id are required")
			}
			if err := store.RevokeInvitation(ctx, tc.UserID, org, id); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	// Audit log ----------------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_audit_events",
			Description: "List an organization's audit log (who changed what), newest first. Each entry has an actor, action, summary, and time.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"limit":{"type":"integer","description":"Max entries (default 30)"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope: "read:org",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in auditQueryInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			org := strings.TrimSpace(in.Org)
			if org == "" {
				return nil, fmt.Errorf("org is required")
			}
			limit := in.Limit
			if limit <= 0 {
				limit = 30
			}
			events, err := store.ListAuditLog(ctx, tc.UserID, org, limit)
			if err != nil {
				return nil, err
			}
			return map[string]any{"events": events}, nil
		},
	})

	// Notifications ------------------------------------------------------------

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_notifications",
			Description: "List the current user's notifications, newest first. Each has an id, type, title, optional body/link, and read_at (null when unread).",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"limit":{"type":"integer","description":"Max notifications to return (default 20)"}},"additionalProperties":false}`),
		},
		Scope: "notifications",
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in notificationInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			limit := in.Limit
			if limit <= 0 {
				limit = 20
			}
			notes, err := store.ListNotifications(ctx, tc.UserID, limit)
			if err != nil {
				return nil, err
			}
			return map[string]any{"notifications": notes}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "mark_notification_read",
			Description: "Mark one of the current user's notifications as read, by its id.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"id":{"type":"string","description":"Notification id"}},"required":["id"],"additionalProperties":false}`),
		},
		Scope:    "notifications",
		Mutating: true,
		Summarize: func(input json.RawMessage) string {
			var in notificationInput
			_ = json.Unmarshal(input, &in)
			return fmt.Sprintf("Mark notification %q read", strings.TrimSpace(in.ID))
		},
		Run: func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in notificationInput
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			if strings.TrimSpace(in.ID) == "" {
				return nil, fmt.Errorf("id is required")
			}
			if err := store.MarkNotificationRead(ctx, tc.UserID, strings.TrimSpace(in.ID)); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "mark_all_notifications_read",
			Description: "Mark all of the current user's notifications as read.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Mutating:  true,
		Summarize: func(json.RawMessage) string { return "Mark all notifications read" },
		Run: func(ctx context.Context, tc ToolContext, _ json.RawMessage) (any, error) {
			if err := store.MarkAllNotificationsRead(ctx, tc.UserID); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true}, nil
		},
	})

	if docsIdx != nil {
		registerDocsTools(r, docsIdx)
	}

	return r
}

// roleOrDefault returns a trimmed role, defaulting to "member" when unset.
func roleOrDefault(role string) string {
	if r := strings.TrimSpace(role); r != "" {
		return r
	}
	return "member"
}

// registerDocsTools adds the read-only documentation retrieval tools. They are
// Public: safe on the unauthenticated MCP front door, because they touch no
// tenant data and never mutate. Internal docs are gated on the caller being an
// authenticated user (tc.AllowInternalDocs), so they never leak to public MCP.
func registerDocsTools(r *Registry, idx DocsIndex) {
	r.add(Tool{
		Public: true,
		Def: ToolDef{
			Name:        "search_docs",
			Description: "Search Flagon's documentation and company handbook. Use this to answer questions about how Flagon works, its API, and how the company operates. Returns ranked matches with a slug, title, and snippet; call get_doc to read the full page.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"query":{"type":"string","description":"What to search for"},"limit":{"type":"integer","description":"Max results (default 5)"}},"required":["query"],"additionalProperties":false}`),
		},
		Run: func(_ context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in struct {
				Query string `json:"query"`
				Limit int    `json:"limit"`
			}
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			if strings.TrimSpace(in.Query) == "" {
				return nil, fmt.Errorf("query is required")
			}
			limit := in.Limit
			if limit <= 0 {
				limit = 5
			}
			return map[string]any{"results": idx.Search(in.Query, tc.AllowInternalDocs, limit)}, nil
		},
	})

	r.add(Tool{
		Public: true,
		Def: ToolDef{
			Name:        "get_doc",
			Description: "Read one Flagon documentation page in full by its slug (e.g. \"platform/projects\"), as returned by search_docs.",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"slug":{"type":"string","description":"The doc slug, e.g. platform/projects"}},"required":["slug"],"additionalProperties":false}`),
		},
		Run: func(_ context.Context, tc ToolContext, input json.RawMessage) (any, error) {
			var in struct {
				Slug string `json:"slug"`
			}
			if err := json.Unmarshal(input, &in); err != nil {
				return nil, err
			}
			doc, ok := idx.Get(strings.TrimSpace(in.Slug), tc.AllowInternalDocs)
			if !ok {
				return nil, fmt.Errorf("no such doc: %q", in.Slug)
			}
			return map[string]any{"doc": doc}, nil
		},
	})
}

type createOrgInput struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type projectQueryInput struct {
	Org     string `json:"org"`
	Project string `json:"project"`
	Q       string `json:"q"`
	Cursor  string `json:"cursor"`
}

type createProjectInput struct {
	Org           string `json:"org"`
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Description   string `json:"description"`
	RepositoryURL string `json:"repository_url"`
}

// updateProjectInput uses pointers so an omitted field stays unchanged, matching
// the partial-update semantics of db.ProjectUpdate.
type updateProjectInput struct {
	Org           string  `json:"org"`
	Project       string  `json:"project"`
	Name          *string `json:"name"`
	Slug          *string `json:"slug"`
	Description   *string `json:"description"`
	Readme        *string `json:"readme"`
	RepositoryURL *string `json:"repository_url"`
}

// projectMemberInput covers the project-collaborator tools; each uses the subset
// of fields its schema declares.
type projectMemberInput struct {
	Org     string `json:"org"`
	Project string `json:"project"`
	Login   string `json:"login"`
	UserID  string `json:"user_id"`
	Role    string `json:"role"`
}

// teamInput covers the team + team-membership tools; each uses the subset of
// fields its schema declares.
type teamInput struct {
	Org         string  `json:"org"`
	Team        string  `json:"team"`
	Name        *string `json:"name"`
	Slug        *string `json:"slug"`
	Description *string `json:"description"`
	Login       string  `json:"login"`
	UserID      string  `json:"user_id"`
	Role        string  `json:"role"`
}

// projectTeamInput covers the project team-grant tools.
type projectTeamInput struct {
	Org     string `json:"org"`
	Project string `json:"project"`
	Team    string `json:"team"`
	Role    string `json:"role"`
}

// projectOwnerInput covers the project-owner tools.
type projectOwnerInput struct {
	Org         string `json:"org"`
	Project     string `json:"project"`
	Type        string `json:"type"`
	Login       string `json:"login"`
	PrincipalID string `json:"principal_id"`
}

// orgScopedInput is the shared shape for tools that take only an org slug.
type orgScopedInput struct {
	Org string `json:"org"`
}

// orgSecurityInput drives set_org_security. The policy fields are pointers so an
// omitted field is left unchanged (partial update), not reset to its zero value.
type orgSecurityInput struct {
	Org              string  `json:"org"`
	EnforceTwoFactor *bool   `json:"enforce_two_factor"`
	RequireSSO       *bool   `json:"require_sso"`
	BasePermission   *string `json:"base_permission"`
}

// memberInput covers the member + invitation tools; each uses the subset of
// fields its schema declares.
type memberInput struct {
	Org    string `json:"org"`
	Login  string `json:"login"`
	Email  string `json:"email"`
	UserID string `json:"user_id"`
	Role   string `json:"role"`
	ID     string `json:"id"`
}

type notificationInput struct {
	ID    string `json:"id"`
	Limit int    `json:"limit"`
}

type auditQueryInput struct {
	Org   string `json:"org"`
	Limit int    `json:"limit"`
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
