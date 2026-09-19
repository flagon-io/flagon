package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/db"
)

// registerAuditAPI wires the org-scoped audit log (read-only, owners/admins only,
// enforced in the audit store's SECURITY DEFINER window). It supports search, an
// action filter, an actor filter, and keyset pagination advertised via the RFC
// 5988 Link header (rel="next") - the modern, cursor-based approach for logs.
func registerAuditAPI(api huma.API, store IdentityStore, auditStore *audit.Store, internalToken string) {
	if auditStore == nil {
		return
	}
	auth := combinedAuth(api, store, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "list-audit-log",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/audit",
		Summary:     "List an organization's audit log",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *AuditListInput) (*AuditOutput, error) {
		actorID, _ := identity(ctx)

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
			return nil, huma.Error500InternalServerError("could not load the audit log", err)
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *struct {
		Slug string `path:"slug"`
	}) (*AuditConfigOutput, error) {
		actorID, _ := identity(ctx)
		ip, err := store.GetAuditConfig(ctx, actorID, in.Slug)
		if err != nil {
			return nil, auditConfigErr(err)
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *AuditConfigInput) (*AuditConfigOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.SetAuditConfig(ctx, actorID, in.Slug, in.Body.IPDisclosure); err != nil {
			return nil, auditConfigErr(err)
		}
		out := &AuditConfigOutput{}
		out.Body.IPDisclosure = in.Body.IPDisclosure
		return out, nil
	})
}

func auditConfigErr(err error) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	default:
		return huma.Error500InternalServerError("could not update the audit configuration", err)
	}
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
