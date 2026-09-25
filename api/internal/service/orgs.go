package service

import (
	"context"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
)

// Me returns the caller (mirrored on first sight) and the orgs they belong to.
func (s *Service) Me(ctx context.Context, a Actor) (db.User, []db.Org, error) {
	user, orgs, err := s.store.Me(ctx, a.UserID, a.Email)
	return user, orgs, classify(err)
}

// ListOrgs returns the orgs the caller belongs to.
func (s *Service) ListOrgs(ctx context.Context, a Actor) ([]db.Org, error) {
	orgs, err := s.store.ListOrgs(ctx, a.UserID)
	return orgs, classify(err)
}

// CreateOrg creates an org owned by the caller. The slug is normalized, or
// derived from the name when omitted. Emits a welcome notification.
func (s *Service) CreateOrg(ctx context.Context, a Actor, name, slug string) (db.Org, error) {
	// Only a user can own a new org; an org access token's service principal is
	// bound to its own org and must never mint (and own) others.
	if err := RequireUser(a); err != nil {
		return db.Org{}, err
	}
	name, slug, err := nameAndSlug(name, slug)
	if err != nil {
		return db.Org{}, err
	}
	org, err := s.store.CreateOrg(ctx, a.UserID, a.Email, name, slug)
	if err != nil {
		return db.Org{}, classify(err)
	}
	s.notify(ctx, a.UserID, &org.ID, "org.created",
		"Welcome to "+org.Name, "Your organization is ready. Invite teammates to get started.", "/"+org.Slug)
	return org, nil
}

// UpdateOrg renames an org (owners/admins).
func (s *Service) UpdateOrg(ctx context.Context, a Actor, orgSlug, name string) (db.Org, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Org{}, Invalid("name is required")
	}
	org, err := s.store.UpdateOrg(ctx, a.UserID, orgSlug, name)
	return org, classify(err)
}

// GetOrg returns one org the caller belongs to, with their role.
func (s *Service) GetOrg(ctx context.Context, a Actor, orgSlug string) (db.Org, error) {
	org, err := s.store.GetOrg(ctx, a.UserID, orgSlug)
	return org, classify(err)
}

// LeaveOrg removes the caller's own membership. The sole owner cannot leave.
func (s *Service) LeaveOrg(ctx context.Context, a Actor, orgSlug string) error {
	// A service principal leaving would orphan its own token; revoke it instead.
	if err := RequireUser(a); err != nil {
		return err
	}
	return classify(s.store.LeaveOrg(ctx, a.UserID, orgSlug), leaveOverrides...)
}

// RequireOrgMember fails with db.ErrNotMember (classified 404) unless the caller
// belongs to the org with the given id. It guards operations that take an org by
// id from the request body (the AI endpoints), where RLS alone would silently
// scope the work to nothing rather than reject it.
func (s *Service) RequireOrgMember(ctx context.Context, a Actor, orgID string) error {
	if strings.TrimSpace(orgID) == "" {
		return Invalid("org_id is required")
	}
	ok, err := s.store.IsOrgMember(ctx, a.UserID, orgID)
	if err != nil {
		return classify(err)
	}
	if !ok {
		return classify(db.ErrNotMember)
	}
	return nil
}

// DeleteOrg soft-deletes an org (owners only). It disappears for every member at
// once and stays restorable by an owner for db.DeletedRetention; its slug is
// freed. Every human member is told, since the org just vanished for them.
func (s *Service) DeleteOrg(ctx context.Context, a Actor, orgSlug string) (db.Org, error) {
	org, members, err := s.store.DeleteOrg(ctx, a.UserID, orgSlug)
	if err != nil {
		return db.Org{}, classify(err, deleteOrgOverrides...)
	}
	for _, id := range members {
		link := ""
		body := "An owner deleted " + org.Name + ". Owners can restore it for 30 days."
		if id == a.UserID {
			link = "/settings/organizations"
			body = "You deleted " + org.Name + ". You can restore it from your organizations for 30 days."
		}
		// org_id stays nil: the org is gone, and its notifications must not hang
		// off an org the recipient can no longer see.
		s.notify(ctx, id, nil, "org.deleted", org.Name+" was deleted", body, link)
	}
	return org, nil
}

// ListDeletedOrgs returns the orgs the caller owned that were deleted within the
// retention window (their "recently deleted" archive).
func (s *Service) ListDeletedOrgs(ctx context.Context, a Actor) ([]db.DeletedOrg, error) {
	if err := RequireUser(a); err != nil { // an owner's personal archive
		return nil, err
	}
	orgs, err := s.store.ListDeletedOrgs(ctx, a.UserID)
	return orgs, classify(err)
}

// RestoreOrg restores a deleted org the caller owns, optionally under a new slug
// (required when its old slug was taken meanwhile). Restoring counts toward the
// owned-org plan limit again.
func (s *Service) RestoreOrg(ctx context.Context, a Actor, orgID, newSlug string) (db.Org, error) {
	if err := RequireUser(a); err != nil { // restoring counts toward the owner's plan
		return db.Org{}, err
	}
	orgID = strings.TrimSpace(orgID)
	if orgID == "" {
		return db.Org{}, Invalid("id is required")
	}
	slug := ""
	if strings.TrimSpace(newSlug) != "" {
		slug = Slugify(newSlug)
		if slug == "" {
			return db.Org{}, Invalid("slug must contain a letter or digit")
		}
	}
	org, err := s.store.RestoreOrg(ctx, a.UserID, orgID, slug)
	return org, classify(err, restoreOrgOverrides...)
}
