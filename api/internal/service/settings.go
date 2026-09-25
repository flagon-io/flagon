package service

import (
	"context"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// OrgSecurityPatch is a partial security-policy update: a nil field is left as
// it is.
type OrgSecurityPatch struct {
	EnforceTwoFactor *bool
	RequireSSO       *bool
	BasePermission   *string
}

// GetOrgSecurity returns an org's security + member-access policy.
func (s *Service) GetOrgSecurity(ctx context.Context, a Actor, orgSlug string) (db.OrgSecurity, error) {
	sec, err := s.store.GetOrgSecurity(ctx, a.UserID, orgSlug)
	return sec, classify(err)
}

// SetOrgSecurity replaces an org's security policy (owners/admins).
func (s *Service) SetOrgSecurity(ctx context.Context, a Actor, orgSlug string, sec db.OrgSecurity) (db.OrgSecurity, error) {
	sec.BasePermission = strings.TrimSpace(sec.BasePermission)
	if err := s.store.SetOrgSecurity(ctx, a.UserID, orgSlug, sec); err != nil {
		return db.OrgSecurity{}, classify(err, securityOverrides...)
	}
	return sec, nil
}

// PatchOrgSecurity merges a partial update onto the current policy and saves it,
// so an omitted field is left unchanged rather than reset.
func (s *Service) PatchOrgSecurity(ctx context.Context, a Actor, orgSlug string, p OrgSecurityPatch) (db.OrgSecurity, error) {
	sec, err := s.store.GetOrgSecurity(ctx, a.UserID, orgSlug)
	if err != nil {
		return db.OrgSecurity{}, classify(err)
	}
	if p.EnforceTwoFactor != nil {
		sec.EnforceTwoFactor = *p.EnforceTwoFactor
	}
	if p.RequireSSO != nil {
		sec.RequireSSO = *p.RequireSSO
	}
	if p.BasePermission != nil {
		sec.BasePermission = *p.BasePermission
	}
	return s.SetOrgSecurity(ctx, a, orgSlug, sec)
}

// GetAuditConfig returns whether actor IPs are disclosed in the org's audit log.
func (s *Service) GetAuditConfig(ctx context.Context, a Actor, orgSlug string) (bool, error) {
	ip, err := s.store.GetAuditConfig(ctx, a.UserID, orgSlug)
	return ip, classify(err)
}

// SetAuditConfig toggles actor-IP disclosure in the org's audit log.
func (s *Service) SetAuditConfig(ctx context.Context, a Actor, orgSlug string, ipDisclosure bool) (bool, error) {
	if err := s.store.SetAuditConfig(ctx, a.UserID, orgSlug, ipDisclosure); err != nil {
		return false, classify(err)
	}
	return ipDisclosure, nil
}

// ListAuditLog returns an org's most recent audit events (owners/admins).
func (s *Service) ListAuditLog(ctx context.Context, a Actor, orgSlug string, limit int) ([]db.AuditEvent, error) {
	// The store's definer window answers a plain member with an empty list; say
	// 403 instead, like every other admin-only read.
	if err := s.RequireOrgAdmin(ctx, a, orgSlug); err != nil {
		return nil, err
	}
	events, err := s.store.ListAuditLog(ctx, a.UserID, orgSlug, paginate.ClampLimit(limit))
	return events, classify(err)
}

// ListNotifications returns the caller's notifications, newest first.
func (s *Service) ListNotifications(ctx context.Context, a Actor, limit int) ([]db.Notification, error) {
	notes, err := s.store.ListNotifications(ctx, a.UserID, paginate.ClampLimit(limit))
	return notes, classify(err)
}

// UnreadNotificationCount returns how many of the caller's notifications are
// unread.
func (s *Service) UnreadNotificationCount(ctx context.Context, a Actor) (int, error) {
	n, err := s.store.UnreadNotificationCount(ctx, a.UserID)
	return n, classify(err)
}

// MarkNotificationRead marks one of the caller's notifications read.
func (s *Service) MarkNotificationRead(ctx context.Context, a Actor, id string) error {
	if id = strings.TrimSpace(id); id == "" {
		return Invalid("id is required")
	}
	return classify(s.store.MarkNotificationRead(ctx, a.UserID, id))
}

// MarkNotificationUnread marks one of the caller's notifications unread.
func (s *Service) MarkNotificationUnread(ctx context.Context, a Actor, id string) error {
	if id = strings.TrimSpace(id); id == "" {
		return Invalid("id is required")
	}
	return classify(s.store.MarkNotificationUnread(ctx, a.UserID, id))
}

// MarkAllNotificationsRead marks every one of the caller's notifications read.
func (s *Service) MarkAllNotificationsRead(ctx context.Context, a Actor) error {
	return classify(s.store.MarkAllNotificationsRead(ctx, a.UserID))
}
