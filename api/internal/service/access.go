package service

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
)

// Caller-facing policy messages. They say exactly what to fix.
const (
	msgTwoFactorRequired = "this organization requires two-factor authentication; enable it on your account to continue"
	msgSSORequired       = "this organization requires single sign-on; sign in through the organization's identity provider to continue"
	msgSSOLinkRequired   = "this organization requires single sign-on; sign in through the organization's identity provider at least once before using a personal access token with it"
	msgUserOnly          = "this operation requires a user; organization access tokens can't perform it"
)

// forbidden is a 403 with a caller-facing message (it still matches
// db.ErrForbidden under errors.Is).
func forbidden(msg string) error {
	return &Error{Status: http.StatusForbidden, Message: msg, Err: db.ErrForbidden}
}

// AccessStore is the read behind the org security-policy check.
type AccessStore interface {
	OrgAccessState(ctx context.Context, userID, orgSlug, orgID string) (db.OrgAccess, error)
}

// CheckOrgAccess enforces an org's security policy (2FA + SSO requirements) for
// the actor, on the org named by slug. Every org-scoped front door calls it (the
// REST middleware for /orgs/{slug} operations, the agent and MCP tool runner for
// any tool naming an org, and the /ai endpoints for the conversation's org), so
// the policy holds for gateway sessions, tokens, and the agent alike. The app's
// page gate only adds the redirect UX on top.
func (s *Service) CheckOrgAccess(ctx context.Context, a Actor, orgSlug string) error {
	if strings.TrimSpace(orgSlug) == "" {
		return nil
	}
	return s.checkOrgAccess(ctx, a, orgSlug, "")
}

// CheckOrgAccessByID is CheckOrgAccess for an org named by id.
func (s *Service) CheckOrgAccessByID(ctx context.Context, a Actor, orgID string) error {
	if strings.TrimSpace(orgID) == "" {
		return nil
	}
	return s.checkOrgAccess(ctx, a, "", orgID)
}

func (s *Service) checkOrgAccess(ctx context.Context, a Actor, slug, id string) error {
	// Org access tokens are exempt. Their principal is a service account minted
	// by an org owner/admin, bound to that one org, with no interactive sign-in:
	// 2FA and SSO are properties of how a HUMAN authenticates, which a service
	// principal never does. Its lifetime and scopes are controlled by the org's
	// own admins (who are subject to the policy when they mint it).
	if a.IsServicePrincipal() {
		return nil
	}
	st, err := s.store.OrgAccessState(ctx, a.UserID, slug, id)
	if err != nil {
		return classify(err)
	}
	return evaluateOrgAccess(a, st)
}

// evaluateOrgAccess is the pure policy decision (unit-tested on its own).
func evaluateOrgAccess(a Actor, st db.OrgAccess) error {
	if a.IsServicePrincipal() || !st.Member || st.IsService {
		// Not a member: let the operation itself answer (404, nothing leaked).
		return nil
	}
	if st.EnforceTwoFactor && !st.UserTwoFactor {
		return forbidden(msgTwoFactorRequired)
	}
	// Owners are exempt from the SSO requirement (break-glass, matching the app
	// gate): SSO can fail in ways 2FA can't (an IdP outage, a broken
	// certificate), and an owner must always be able to reach the settings to
	// fix or disable it.
	if st.RequireSSO && st.Role != db.RoleOwner {
		switch a.Via {
		case ViaPAT:
			// A personal access token carries no session, so it can't prove HOW its
			// owner signed in. The rule for tokens: the owner must have signed in
			// through one of this org's SSO providers at least once (a linked SSO
			// identity, mirrored from the app). Unlinking or never linking denies.
			if !st.LinkedSSO {
				return forbidden(msgSSOLinkRequired)
			}
		default:
			// A gateway session (or an unknown path, treated as strictly as a
			// session): the CURRENT session must have been established through one
			// of this org's live providers, as asserted by the app.
			if a.SSOProviderID == "" || !slices.Contains(st.ProviderIDs, a.SSOProviderID) {
				return forbidden(msgSSORequired)
			}
		}
	}
	return nil
}

// RequireUser fails with a 403 when the actor is an org access token's service
// principal. Account-level operations (creating or leaving an org, managing a
// personal profile) only make sense for a human user.
func RequireUser(a Actor) error {
	if a.IsServicePrincipal() {
		return forbidden(msgUserOnly)
	}
	return nil
}

// RequireOrgAdmin fails with a 403 unless the actor is an owner or admin of the
// org (a non-member is a 404). It guards admin-only reads whose store would
// otherwise answer a plain member with an empty result.
func (s *Service) RequireOrgAdmin(ctx context.Context, a Actor, orgSlug string) error {
	org, err := s.store.GetOrg(ctx, a.UserID, orgSlug)
	if err != nil {
		return classify(err)
	}
	if org.Role != db.RoleOwner && org.Role != db.RoleAdmin {
		return forbidden("only organization owners and admins can do that")
	}
	return nil
}

// securityOverrides word the self-lockout guard's refusals.
var securityOverrides = []Override{
	{db.ErrTwoFactorSelf, http.StatusForbidden, "enable two-factor authentication on your own account before requiring it for the organization"},
	{db.ErrSSOSelf, http.StatusForbidden, "sign in through one of the organization's SSO providers before requiring single sign-on"},
}
