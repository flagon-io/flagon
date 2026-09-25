package service

import (
	"context"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// The persistence the service needs, split per resource so each concern (and
// each test fake) only has to satisfy the slice it touches. *db.DB satisfies
// every one of them; Store composes them for the Service.

// OrgStore covers organizations and the caller's own membership in them.
type OrgStore interface {
	Me(ctx context.Context, userID, email string) (db.User, []db.Org, error)
	ListOrgs(ctx context.Context, userID string) ([]db.Org, error)
	CreateOrg(ctx context.Context, userID, email, name, slug string) (db.Org, error)
	UpdateOrg(ctx context.Context, actorID, slug, name string) (db.Org, error)
	GetOrg(ctx context.Context, actorID, orgSlug string) (db.Org, error)
	LeaveOrg(ctx context.Context, userID, slug string) error
	IsOrgMember(ctx context.Context, userID, orgID string) (bool, error)
	DeleteOrg(ctx context.Context, actorID, slug string) (db.Org, []string, error)
	ListDeletedOrgs(ctx context.Context, actorID string) ([]db.DeletedOrg, error)
	RestoreOrg(ctx context.Context, actorID, orgID, newSlug string) (db.Org, error)
}

// MemberStore covers managing an org's members.
type MemberStore interface {
	ListMembers(ctx context.Context, actorID, slug string, q paginate.Query) ([]db.Member, string, error)
	AddMember(ctx context.Context, actorID, slug, login, role string) (targetID, orgName string, err error)
	SetMemberRole(ctx context.Context, actorID, slug, targetID, newRole string) error
	RemoveMember(ctx context.Context, actorID, slug, targetID string) error
}

// InvitationStore covers org invitations, including the pre-auth token flow.
type InvitationStore interface {
	InviteMember(ctx context.Context, actorID, slug, login, role string) (db.InviteResult, error)
	ListInvitations(ctx context.Context, actorID, slug string, q paginate.Query) ([]db.Invitation, string, error)
	RevokeInvitation(ctx context.Context, actorID, slug, id string) error
	InvitationByToken(ctx context.Context, token string) (*db.InviteLookup, error)
	AcceptInvitation(ctx context.Context, userID, email, token string) (slug, name, invitedBy string, err error)
}

// ProjectStore covers projects themselves.
type ProjectStore interface {
	ListProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Project, string, error)
	ListDeletedProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Project, string, error)
	CreateProject(ctx context.Context, actorID, orgSlug string, in db.ProjectInput) (db.Project, error)
	GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (db.Project, error)
	UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in db.ProjectUpdate) (db.Project, error)
	SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (db.Project, error)
	RestoreProject(ctx context.Context, actorID, orgSlug, projectSlug, newSlug string) (db.Project, error)
}

// ProjectMemberStore covers per-project collaborator grants.
type ProjectMemberStore interface {
	ListProjectMembers(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectMember, string, error)
	AddProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, login, role string) (targetID string, err error)
	SetProjectMemberRole(ctx context.Context, actorID, orgSlug, projectSlug, targetID, role string) error
	RemoveProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, targetID string) error
}

// ProjectTeamStore covers team grants on a project.
type ProjectTeamStore interface {
	ListProjectTeams(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectTeam, string, error)
	AddProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error
	SetProjectTeamRole(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error
	RemoveProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug string) error
}

// ProjectOwnerStore covers project ownership (the tier above admin).
type ProjectOwnerStore interface {
	ListProjectOwners(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectOwner, string, error)
	AddProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, login string) (principalID string, err error)
	RemoveProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, principalID string) error
}

// TeamStore covers teams and their membership.
type TeamStore interface {
	ListTeams(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]db.Team, string, error)
	GetTeam(ctx context.Context, actorID, orgSlug, teamSlug string) (db.Team, error)
	CreateTeam(ctx context.Context, actorID, orgSlug string, in db.TeamInput) (db.Team, error)
	UpdateTeam(ctx context.Context, actorID, orgSlug, teamSlug string, in db.TeamUpdate) (db.Team, error)
	DeleteTeam(ctx context.Context, actorID, orgSlug, teamSlug string) error
	ListTeamMembers(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamMember, string, error)
	ListTeamProjects(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamProject, string, error)
	AddTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, login, role string) (targetID string, err error)
	SetTeamMemberRole(ctx context.Context, actorID, orgSlug, teamSlug, targetID, role string) error
	RemoveTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, targetID string) error
}

// AuditStore covers an org's audit configuration and the simple recent-events
// read (the rich, filtered read lives in the audit package's Store).
type AuditStore interface {
	GetAuditConfig(ctx context.Context, actorID, orgSlug string) (ipDisclosure bool, err error)
	SetAuditConfig(ctx context.Context, actorID, orgSlug string, ipDisclosure bool) error
	ListAuditLog(ctx context.Context, actorID, orgSlug string, limit int) ([]db.AuditEvent, error)
}

// OrgSecurityStore covers an org's security + member-access policy.
type OrgSecurityStore interface {
	GetOrgSecurity(ctx context.Context, actorID, orgSlug string) (db.OrgSecurity, error)
	SetOrgSecurity(ctx context.Context, actorID, orgSlug string, s db.OrgSecurity) error
}

// SSOProviderStore covers an org's SSO (OIDC/SAML) provider configuration. Reads
// never return secrets.
type SSOProviderStore interface {
	ListSSOProviders(ctx context.Context, actorID, orgSlug string) ([]db.SSOProvider, error)
	GetSSOProvider(ctx context.Context, actorID, orgSlug, providerID string) (db.SSOProvider, error)
	CreateSSOProvider(ctx context.Context, actorID, orgSlug string, in db.SSOProviderInput) (db.SSOProvider, error)
	UpdateSSOProvider(ctx context.Context, actorID, orgSlug, providerID string, in db.SSOProviderUpdate) (db.SSOProvider, error)
	DeleteSSOProvider(ctx context.Context, actorID, orgSlug, providerID string) error
}

// NotificationStore covers the caller's notification feed and emitting new ones.
type NotificationStore interface {
	ListNotifications(ctx context.Context, userID string, limit int) ([]db.Notification, error)
	UnreadNotificationCount(ctx context.Context, userID string) (int, error)
	MarkNotificationRead(ctx context.Context, userID, id string) error
	MarkNotificationUnread(ctx context.Context, userID, id string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error
	CreateNotification(ctx context.Context, userID string, orgID *string, ntype, title, body, link string) error
}

// Store is everything the Service needs, composed from the per-resource stores.
type Store interface {
	OrgStore
	MemberStore
	InvitationStore
	ProjectStore
	ProjectMemberStore
	ProjectTeamStore
	ProjectOwnerStore
	TeamStore
	AuditStore
	OrgSecurityStore
	SSOProviderStore
	NotificationStore
	AccessStore
}
