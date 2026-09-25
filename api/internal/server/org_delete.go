package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// registerOrgDeleteAPI wires organization soft delete, the caller's "recently
// deleted" archive, and restore. Delete is owner-only; a deleted org vanishes for
// every member (RLS, migration 0031) and is restorable by an owner for
// db.DeletedRetention. The archive and restore address an org by id, not slug:
// a deleted org's slug may already belong to a new live org.
func registerOrgDeleteAPI(api huma.API, d deps) {
	huma.Register(api, huma.Operation{
		OperationID: "delete-org",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}",
		Summary:     "Delete an organization (soft delete; restorable by an owner for 30 days)",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *DeleteOrgInput) (*OrgOutput, error) {
		org, err := d.svc.DeleteOrg(ctx, actor(ctx), in.Slug)
		if err != nil {
			return nil, apiErr(err, "could not delete org")
		}
		out := &OrgOutput{}
		out.Body = org
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "list-deleted-orgs",
		Method:      http.MethodGet,
		Path:        "/deleted-orgs",
		Summary:     "List the organizations you owned that were deleted in the last 30 days",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, _ *struct{}) (*DeletedOrgsOutput, error) {
		orgs, err := d.svc.ListDeletedOrgs(ctx, actor(ctx))
		if err != nil {
			return nil, apiErr(err, "could not list deleted orgs")
		}
		out := &DeletedOrgsOutput{}
		out.Body.Orgs = orgs
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "restore-org",
		Method:      http.MethodPost,
		Path:        "/deleted-orgs/{id}/restore",
		Summary:     "Restore a deleted organization",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RestoreOrgInput) (*OrgOutput, error) {
		newSlug := ""
		if in.Body != nil {
			newSlug = in.Body.Slug
		}
		org, err := d.svc.RestoreOrg(ctx, actor(ctx), in.ID, newSlug)
		if err != nil {
			return nil, apiErr(err, "could not restore org")
		}
		out := &OrgOutput{}
		out.Body = org
		return out, nil
	})
}

// DeleteOrgInput identifies the org to delete.
type DeleteOrgInput struct {
	Slug string `path:"slug" doc:"The organization slug" example:"acme"`
}

// DeletedOrgsOutput is the caller's recently deleted orgs, newest first.
type DeletedOrgsOutput struct {
	Body struct {
		Orgs []db.DeletedOrg `json:"orgs"`
	}
}

// RestoreOrgInput restores a deleted org by id, optionally under a new slug.
type RestoreOrgInput struct {
	ID   string          `path:"id" doc:"The deleted organization's id"`
	Body *RestoreOrgBody `required:"false"`
}

// RestoreOrgBody is the optional restore payload.
type RestoreOrgBody struct {
	Slug string `json:"slug,omitempty" doc:"A new slug; required when the old slug was taken while the org was deleted"`
}
