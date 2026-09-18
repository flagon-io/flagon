package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/docs"
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

	ListProjects(ctx context.Context, actorID, orgSlug string) ([]db.Project, error)
	GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (db.Project, error)
	CreateProject(ctx context.Context, actorID, orgSlug string, in db.ProjectInput) (db.Project, error)
	UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in db.ProjectUpdate) (db.Project, error)
	SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (db.Project, error)

	ListMembers(ctx context.Context, actorID, slug string) ([]db.Member, error)
	AddMember(ctx context.Context, actorID, slug, login, role string) (targetID, orgName string, err error)
	SetMemberRole(ctx context.Context, actorID, slug, targetID, newRole string) error
	RemoveMember(ctx context.Context, actorID, slug, targetID string) error

	ListInvitations(ctx context.Context, actorID, slug string) ([]db.Invitation, error)
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
			Description: "List the projects in an organization by its slug.",
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
			projects, err := store.ListProjects(ctx, tc.UserID, org)
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
		Scope:    "write:project",
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
		Scope:    "write:project",
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
			members, err := store.ListMembers(ctx, tc.UserID, strings.TrimSpace(in.Org))
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
			invites, err := store.ListInvitations(ctx, tc.UserID, strings.TrimSpace(in.Org))
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
		Scope:    "notifications",
		Mutating: true,
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

// orgScopedInput is the shared shape for tools that take only an org slug.
type orgScopedInput struct {
	Org string `json:"org"`
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
