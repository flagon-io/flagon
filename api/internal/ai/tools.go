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

	if docsIdx != nil {
		registerDocsTools(r, docsIdx)
	}

	return r
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

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
