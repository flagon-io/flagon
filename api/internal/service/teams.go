package service

import (
	"context"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// CreateTeamInput is a new team. Slug is optional (derived from Name).
type CreateTeamInput struct {
	Name        string
	Slug        string
	Description string
}

// UpdateTeamInput is a partial team edit: a nil field is left unchanged. A
// non-nil Slug renames the team.
type UpdateTeamInput struct {
	Name        *string
	Slug        *string
	Description *string
}

// ListTeams returns a page of an org's teams.
func (s *Service) ListTeams(ctx context.Context, a Actor, orgSlug string, q paginate.Query) ([]db.Team, string, error) {
	teams, next, err := s.store.ListTeams(ctx, a.UserID, orgSlug, q)
	return teams, next, classify(err)
}

// GetTeam returns one team.
func (s *Service) GetTeam(ctx context.Context, a Actor, orgSlug, teamSlug string) (db.Team, error) {
	t, err := s.store.GetTeam(ctx, a.UserID, orgSlug, teamSlug)
	return t, classify(err)
}

// CreateTeam creates a team; the creator becomes its first maintainer.
func (s *Service) CreateTeam(ctx context.Context, a Actor, orgSlug string, in CreateTeamInput) (db.Team, error) {
	name, slug, err := nameAndSlug(in.Name, in.Slug)
	if err != nil {
		return db.Team{}, err
	}
	t, err := s.store.CreateTeam(ctx, a.UserID, orgSlug, db.TeamInput{
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(in.Description),
	})
	return t, classify(err)
}

// UpdateTeam applies a partial edit to a team.
func (s *Service) UpdateTeam(ctx context.Context, a Actor, orgSlug, teamSlug string, in UpdateTeamInput) (db.Team, error) {
	name, slug, err := renameFields(in.Name, in.Slug)
	if err != nil {
		return db.Team{}, err
	}
	t, err := s.store.UpdateTeam(ctx, a.UserID, orgSlug, teamSlug, db.TeamUpdate{
		Name:        name,
		Slug:        slug,
		Description: in.Description,
	})
	return t, classify(err)
}

// DeleteTeam disbands a team (owners/admins).
func (s *Service) DeleteTeam(ctx context.Context, a Actor, orgSlug, teamSlug string) error {
	return classify(s.store.DeleteTeam(ctx, a.UserID, orgSlug, teamSlug))
}

// ListTeamMembers returns a page of a team's members.
func (s *Service) ListTeamMembers(ctx context.Context, a Actor, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamMember, string, error) {
	members, next, err := s.store.ListTeamMembers(ctx, a.UserID, orgSlug, teamSlug, q)
	return members, next, classify(err)
}

// ListTeamProjects returns a page of the projects a team has access to.
func (s *Service) ListTeamProjects(ctx context.Context, a Actor, orgSlug, teamSlug string, q paginate.Query) ([]db.TeamProject, string, error) {
	projects, next, err := s.store.ListTeamProjects(ctx, a.UserID, orgSlug, teamSlug, q)
	return projects, next, classify(err)
}

// AddTeamMember adds an org member to a team and tells them.
func (s *Service) AddTeamMember(ctx context.Context, a Actor, orgSlug, teamSlug, login, role string) (string, error) {
	login, role = strings.TrimSpace(login), strings.TrimSpace(role)
	if login == "" || role == "" {
		return "", Invalid("login and role are required")
	}
	targetID, err := s.store.AddTeamMember(ctx, a.UserID, orgSlug, teamSlug, login, role)
	if err != nil {
		return "", classify(err)
	}
	s.notify(ctx, targetID, nil, "team.member_added",
		"You were added to a team",
		"You are now a "+role+" of the "+teamSlug+" team.",
		"/"+orgSlug+"/teams/"+teamSlug)
	return targetID, nil
}

// SetTeamMemberRole changes a team member's role.
func (s *Service) SetTeamMemberRole(ctx context.Context, a Actor, orgSlug, teamSlug, userID, role string) error {
	userID, role = strings.TrimSpace(userID), strings.TrimSpace(role)
	if userID == "" || role == "" {
		return Invalid("user_id and role are required")
	}
	return classify(s.store.SetTeamMemberRole(ctx, a.UserID, orgSlug, teamSlug, userID, role))
}

// RemoveTeamMember removes a member from a team.
func (s *Service) RemoveTeamMember(ctx context.Context, a Actor, orgSlug, teamSlug, userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return Invalid("user_id is required")
	}
	return classify(s.store.RemoveTeamMember(ctx, a.UserID, orgSlug, teamSlug, userID))
}
