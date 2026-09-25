package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/service"
)

// DocsIndex is the documentation retrieval surface the docs tools query. It is
// satisfied by *docs.Index and kept as an interface so the registry can be built
// without a corpus (nil) in tests and degraded boots.
type DocsIndex interface {
	Search(query string, includeInternal bool, limit int) []docs.Hit
	Get(slug string, includeInternal bool) (docs.Doc, bool)
}

// ToolContext carries the acting user's identity into a tool run.
type ToolContext struct {
	UserID string
	Email  string
	OrgID  string
	// Via and SSOProviderID describe how the caller authenticated (see
	// service.Actor); the org security policy check reads them.
	Via           string
	SSOProviderID string
	// AllowInternalDocs is true for an authenticated caller (the in-product
	// assistant, or an MCP caller with a valid token), who may read internal
	// documentation. The front door decides; the anonymous MCP sees public docs
	// only.
	AllowInternalDocs bool
	// ConfineOrg, when set, is the slug of the organization an in-product
	// conversation is scoped to (and metered against). Tools may then act only
	// inside that org: a call naming another org, or a CrossOrg tool, is refused
	// (see CheckOrgScope). The MCP front door has no conversation org and leaves
	// it empty, so a token acts wherever its principal can.
	ConfineOrg string
}

// ErrOutsideConversationOrg is the sentinel behind the refusal of a tool call
// that targets an org other than the conversation's.
var ErrOutsideConversationOrg = errors.New("tool call targets another organization")

// CheckOrgScope refuses a tool call that would act outside the conversation's
// org (tc.ConfineOrg). The target is the tool's `org` argument (every org-scoped
// tool names its org that way); CrossOrg tools address an org some other way and
// are refused outright. Tools with no org argument (the caller's own account,
// notifications, docs) are unaffected. Malformed input is left for the tool's
// own validation to report.
func (tc ToolContext) CheckOrgScope(t Tool, input json.RawMessage) error {
	if tc.ConfineOrg == "" {
		return nil
	}
	if t.CrossOrg {
		return &service.Error{
			Status:  http.StatusForbidden,
			Message: fmt.Sprintf("%s can't be run from this conversation, which is scoped to the %q organization; use the Flagon dashboard for it", t.Def.Name, tc.ConfineOrg),
			Err:     ErrOutsideConversationOrg,
		}
	}
	// A missing, null or non-string org is not a target here; the tool's own
	// input binding rejects anything malformed.
	var probe struct {
		Org *string `json:"org"`
	}
	if len(input) == 0 {
		return nil
	}
	if err := json.Unmarshal(input, &probe); err != nil || probe.Org == nil {
		return nil //nolint:nilerr // malformed input is the tool's own binding to reject, not a scope decision
	}
	slug := strings.TrimSpace(*probe.Org)
	if slug == "" || strings.EqualFold(slug, tc.ConfineOrg) {
		return nil
	}
	return &service.Error{
		Status:  http.StatusForbidden,
		Message: fmt.Sprintf("this conversation is scoped to the %q organization and can't act in %q; switch to that organization in Flagon to work there", tc.ConfineOrg, slug),
		Err:     ErrOutsideConversationOrg,
	}
}

// actor is the service principal a tool runs as.
func (tc ToolContext) actor() service.Actor {
	return service.Actor{UserID: tc.UserID, Email: tc.Email, Via: tc.Via, SSOProviderID: tc.SSOProviderID}
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
	// Operation is the REST operation ID this tool is the agent/MCP front door
	// for (e.g. "list-projects"). The server's guardrail tests use it to prove
	// every user-facing operation has a tool and that the tool carries the same
	// scope and read/write nature as its operation. Empty only for Public tools.
	Operation string
	// CrossOrg marks a tool that addresses an organization other than through an
	// `org` slug argument (e.g. restoring a deleted org by id). Such a tool can't
	// be confined to a conversation's org, so the in-product agent refuses it
	// (see ToolContext.CheckOrgScope); MCP callers are unaffected.
	CrossOrg bool
	// Summarize renders a short human sentence describing a proposed call.
	Summarize func(input json.RawMessage) string
	// Run executes the tool as the acting user.
	Run func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error)
}

// Registry holds the tools available to the agent + MCP server.
type Registry struct {
	byName map[string]Tool
	order  []string
	// svc enforces the org security policy before any tool that names an org
	// runs (see policyGated); nil when the registry only serves definitions.
	svc *service.Service
}

// NewRegistry builds the Flagon tool set over the shared service layer and
// (optionally) the documentation index. The same registry drives the in-product
// agent and the MCP server, and every tool calls the same service method as its
// REST operation, so the three front doors cannot drift. Add a tool in the
// resource's tools_*.go file whenever you add a user-facing operation.
//
// A nil docs index simply omits the documentation tools, which keeps the agent
// usable in tests and in degraded boots. A nil service is fine for callers that
// only inspect definitions.
func NewRegistry(svc *service.Service, docsIdx DocsIndex) *Registry {
	r := &Registry{svc: svc}
	registerOrgTools(r, svc)
	registerProjectTools(r, svc)
	registerProjectMemberTools(r, svc)
	registerTeamTools(r, svc)
	registerProjectTeamTools(r, svc)
	registerMemberTools(r, svc)
	registerOrgSecurityTools(r, svc)
	registerSSOProviderTools(r, svc)
	registerInvitationTools(r, svc)
	registerAuditTools(r, svc)
	registerNotificationTools(r, svc)
	if docsIdx != nil {
		registerDocsTools(r, docsIdx)
	}
	return r
}

// Defs returns the tool definitions in registration order.
func (r *Registry) Defs() []ToolDef {
	defs := make([]ToolDef, 0, len(r.order))
	for _, name := range r.order {
		defs = append(defs, r.byName[name].Def)
	}
	return defs
}

// Tools returns every registered tool in registration order.
func (r *Registry) Tools() []Tool {
	tools := make([]Tool, 0, len(r.order))
	for _, name := range r.order {
		tools = append(tools, r.byName[name])
	}
	return tools
}

// PublicDefs returns the definitions of tools safe for the unauthenticated MCP
// front door, in registration order.
func (r *Registry) PublicDefs() []ToolDef {
	return r.DefsFor(func(t Tool) bool { return t.Public })
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

// add registers a tool. A duplicate name is a programming error.
func (r *Registry) add(t Tool) {
	if r.byName == nil {
		r.byName = map[string]Tool{}
	}
	if _, dup := r.byName[t.Def.Name]; dup {
		panic("ai: duplicate tool " + t.Def.Name)
	}
	t.Run = r.policyGated(t.Run)
	r.byName[t.Def.Name] = t
	r.order = append(r.order, t.Def.Name)
}
