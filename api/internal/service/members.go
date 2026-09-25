package service

import (
	"context"
	"log/slog"
	"net/url"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/mail"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// ListMembers returns a page of an org's members.
func (s *Service) ListMembers(ctx context.Context, a Actor, orgSlug string, q paginate.Query) ([]db.Member, string, error) {
	members, next, err := s.store.ListMembers(ctx, a.UserID, orgSlug, q)
	return members, next, classify(err, memberOverrides...)
}

// AddMember adds an existing user (by email or username) to an org. The role
// defaults to member. Emits a welcome notification to the new member.
func (s *Service) AddMember(ctx context.Context, a Actor, orgSlug, login, role string) (targetID, orgName string, err error) {
	login = strings.TrimSpace(login)
	if login == "" {
		return "", "", Invalid("login is required")
	}
	role = orDefault(role, db.RoleMember)
	targetID, orgName, err = s.store.AddMember(ctx, a.UserID, orgSlug, login, role)
	if err != nil {
		return "", "", classify(err, memberOverrides...)
	}
	s.notify(ctx, targetID, nil, "org.member_added",
		"You were added to "+orgName, "You now have access to "+orgName+".", "/"+orgSlug)
	return targetID, orgName, nil
}

// SetMemberRole changes a member's role and tells them.
func (s *Service) SetMemberRole(ctx context.Context, a Actor, orgSlug, userID, role string) error {
	userID, role = strings.TrimSpace(userID), strings.TrimSpace(role)
	if userID == "" || role == "" {
		return Invalid("user_id and role are required")
	}
	if err := s.store.SetMemberRole(ctx, a.UserID, orgSlug, userID, role); err != nil {
		return classify(err, memberOverrides...)
	}
	s.notify(ctx, userID, nil, "org.role_changed",
		"Your role changed", "Your role in this organization is now "+role+".", "/"+orgSlug)
	return nil
}

// RemoveMember removes a member and lets them know (no org link: they lost
// access).
func (s *Service) RemoveMember(ctx context.Context, a Actor, orgSlug, userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return Invalid("user_id is required")
	}
	if err := s.store.RemoveMember(ctx, a.UserID, orgSlug, userID); err != nil {
		return classify(err, memberOverrides...)
	}
	s.notify(ctx, userID, nil, "org.member_removed",
		"You were removed from an organization", "You no longer have access to it.", "")
	return nil
}

// ListInvitations returns a page of an org's pending invitations.
func (s *Service) ListInvitations(ctx context.Context, a Actor, orgSlug string, q paginate.Query) ([]db.Invitation, string, error) {
	invites, next, err := s.store.ListInvitations(ctx, a.UserID, orgSlug, q)
	return invites, next, classify(err, inviteOverrides...)
}

// InviteResult is what InviteMember did, plus whether the invitation email went
// out.
type InviteResult struct {
	db.InviteResult
	// EmailSent reports whether the invitation email was handed to a mail
	// provider that delivers. False when no mailer is configured, the mailer
	// only logs (the development log sender), or delivery failed; the invitation
	// still exists and its token can be delivered another way.
	EmailSent bool
}

// InviteMember invites by email or username: an existing user is added directly
// (and welcomed, same as AddMember); an unknown email gets a pending invitation,
// and the invitation email (with the single-use accept link) is sent from here,
// so every front door (REST, agent, MCP) delivers the same email. The token is
// also in the result for API callers that deliver the link themselves.
func (s *Service) InviteMember(ctx context.Context, a Actor, orgSlug, login, role string) (InviteResult, error) {
	res, err := s.inviteMember(ctx, a, orgSlug, login, role)
	if err != nil {
		return InviteResult{}, err
	}
	out := InviteResult{InviteResult: res}
	if res.Status == "invited" {
		out.EmailSent = s.sendInviteEmail(ctx, a, res)
	}
	return out, nil
}

// sendInviteEmail emails a fresh invitation's accept link, best-effort: the
// invitation already committed, so a delivery failure is logged and reported
// (EmailSent=false), never an error.
func (s *Service) sendInviteEmail(ctx context.Context, a Actor, res db.InviteResult) bool {
	if s.mailer == nil || res.Token == "" {
		return false
	}
	inviter := a.Email
	// The public token lookup carries the inviter's display name.
	if l, err := s.store.InvitationByToken(ctx, res.Token); err == nil && l != nil && strings.TrimSpace(l.Inviter) != "" {
		inviter = l.Inviter
	}
	msg := mail.InviteEmail(res.Email, mail.Invite{
		URL:     s.appURL + "/invite/" + url.PathEscape(res.Token),
		OrgName: res.OrgName,
		Inviter: inviter,
		Role:    res.Invite.Role,
	})
	if err := s.mailer.Send(ctx, msg); err != nil {
		slog.WarnContext(ctx, "could not send invitation email", "invitation", res.Invite.ID, "err", err)
		return false
	}
	// A non-delivering sender (the log mailer) succeeded without reaching
	// anyone, so the inviter must share the link: report it as not sent.
	return s.mailer.Delivers()
}

func (s *Service) inviteMember(ctx context.Context, a Actor, orgSlug, login, role string) (db.InviteResult, error) {
	role = orDefault(role, db.RoleMember)
	res, err := s.store.InviteMember(ctx, a.UserID, orgSlug, strings.TrimSpace(login), role)
	if err != nil {
		return db.InviteResult{}, classify(err, inviteOverrides...)
	}
	if res.Status == "added" {
		s.notify(ctx, res.UserID, nil, "org.member_added",
			"You were added to "+res.OrgName, "You now have access to "+res.OrgName+".", "/"+orgSlug)
	}
	return res, nil
}

// RevokeInvitation revokes a pending invitation by id.
func (s *Service) RevokeInvitation(ctx context.Context, a Actor, orgSlug, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return Invalid("id is required")
	}
	return classify(s.store.RevokeInvitation(ctx, a.UserID, orgSlug, id), inviteOverrides...)
}

// InvitationByToken is the public, pre-auth lookup of an invitation. A nil
// result means no such invitation.
func (s *Service) InvitationByToken(ctx context.Context, token string) (*db.InviteLookup, error) {
	l, err := s.store.InvitationByToken(ctx, token)
	return l, classify(err)
}

// AcceptInvitation joins the caller to the invitation's org (audited in the
// store) and tells the inviter.
func (s *Service) AcceptInvitation(ctx context.Context, a Actor, token string) (orgSlug, orgName string, err error) {
	orgSlug, orgName, invitedBy, err := s.store.AcceptInvitation(ctx, a.UserID, a.Email, token)
	if err != nil {
		return "", "", classify(err, inviteOverrides...)
	}
	if invitedBy != "" {
		s.notify(ctx, invitedBy, nil, "org.invite_accepted",
			a.Email+" joined "+orgName, a.Email+" accepted your invitation to "+orgName+".",
			"/"+orgSlug+"/people")
	}
	return orgSlug, orgName, nil
}
