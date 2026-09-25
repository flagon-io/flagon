package server

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// registerAuditAPI wires the org-scoped audit log (read-only, owners/admins only,
// enforced in the audit store's SECURITY DEFINER window). It supports search, an
// action filter, an actor filter, and keyset pagination advertised via the RFC
// 5988 Link header (rel="next") - the modern, cursor-based approach for logs.
//
// Every operation is registered unconditionally so the OpenAPI spec is complete
// even when no store is wired (spec generation); a missing store is a 503 at
// request time.
func registerAuditAPI(api huma.API, d deps, auditStore *audit.Store) {
	huma.Register(api, huma.Operation{
		OperationID: "list-audit-log",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/audit",
		Summary:     "List an organization's audit log",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AuditListInput) (*AuditOutput, error) {
		if auditStore == nil {
			return nil, huma.Error503ServiceUnavailable("the audit log is not available")
		}
		actorID, _ := identity(ctx)
		// The store's window returns no rows to a plain member; answer 403 (and
		// 404 for a non-member) like every other admin-only read.
		if err := d.svc.RequireOrgAdmin(ctx, actor(ctx), in.Slug); err != nil {
			return nil, apiErr(err, "could not load the audit log")
		}

		cursor, err := audit.DecodeCursor(in.Cursor)
		if err != nil {
			return nil, huma.Error422UnprocessableEntity("invalid pagination cursor")
		}
		actions := make([]audit.Action, 0, len(in.Action))
		for _, a := range in.Action {
			if a = strings.TrimSpace(a); a != "" {
				actions = append(actions, audit.Action(a))
			}
		}

		page, err := auditStore.List(ctx, in.Slug, actorID, audit.Filter{
			Query:   strings.TrimSpace(in.Q),
			Actions: actions,
			ActorID: strings.TrimSpace(in.Actor),
			Cursor:  cursor,
			Limit:   in.Limit,
		})
		if err != nil {
			return nil, apiErr(err, "could not load the audit log")
		}

		out := &AuditOutput{}
		out.Body.Events = page.Events
		if page.Next != nil {
			out.Link = fmt.Sprintf(`<%s>; rel="next"`, auditNextURL(in, page.Next))
		}
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-audit-config",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/audit/config",
		Summary:     "Get an organization's audit configuration",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *struct {
		Slug string `path:"slug"`
	}) (*AuditConfigOutput, error) {
		ip, err := d.svc.GetAuditConfig(ctx, actor(ctx), in.Slug)
		if err != nil {
			return nil, apiErr(err, "could not read the audit configuration")
		}
		out := &AuditConfigOutput{}
		out.Body.IPDisclosure = ip
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-audit-config",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/audit/config",
		Summary:     "Update an organization's audit configuration",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AuditConfigInput) (*AuditConfigOutput, error) {
		ip, err := d.svc.SetAuditConfig(ctx, actor(ctx), in.Slug, in.Body.IPDisclosure)
		if err != nil {
			return nil, apiErr(err, "could not update the audit configuration")
		}
		out := &AuditConfigOutput{}
		out.Body.IPDisclosure = ip
		return out, nil
	})
}

// AuditConfigInput sets an org's audit configuration.
type AuditConfigInput struct {
	Slug string `path:"slug"`
	Body struct {
		IPDisclosure bool `json:"ip_disclosure" doc:"Reveal actor IP addresses in the audit log"`
	}
}

// AuditConfigOutput is an org's audit configuration.
type AuditConfigOutput struct {
	Body struct {
		IPDisclosure bool `json:"ip_disclosure"`
	}
}

// auditNextURL builds the next-page URL for the Link header, preserving the
// active query/filters and swapping in the new cursor.
func auditNextURL(in *AuditListInput, next *audit.Cursor) string {
	q := url.Values{}
	if s := strings.TrimSpace(in.Q); s != "" {
		q.Set("q", s)
	}
	for _, a := range in.Action {
		if a = strings.TrimSpace(a); a != "" {
			q.Add("action", a)
		}
	}
	if s := strings.TrimSpace(in.Actor); s != "" {
		q.Set("actor", s)
	}
	if in.Limit > 0 {
		q.Set("limit", fmt.Sprintf("%d", in.Limit))
	}
	q.Set("cursor", next.Encode())
	return fmt.Sprintf("/orgs/%s/audit?%s", url.PathEscape(in.Slug), q.Encode())
}

// AuditListInput lists an org's audit log, newest first, with search + filters +
// keyset pagination.
type AuditListInput struct {
	Slug   string   `path:"slug"`
	Q      string   `query:"q" doc:"Search across summary, action, actor, and location"`
	Action []string `query:"action" doc:"Filter to these action keys (repeatable)"`
	Actor  string   `query:"actor" doc:"Filter to this actor's user id"`
	Limit  int      `query:"limit" doc:"Results per page (default 30, max 100)"`
	Cursor string   `query:"cursor" doc:"Opaque cursor from a previous page's Link header"`
}

// AuditOutput is one page of the audit log; Link carries the next-page cursor.
type AuditOutput struct {
	Link string `header:"Link"`
	Body struct {
		Events []audit.Event `json:"events"`
	}
}
