package service

import (
	"context"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// CreateProjectInput is a new project. Slug is optional (derived from Name).
type CreateProjectInput struct {
	Name          string
	Slug          string
	Description   string
	Readme        string
	RepositoryURL string
}

// UpdateProjectInput is a partial project edit: a nil field is left unchanged.
// A non-nil Slug renames the project.
type UpdateProjectInput struct {
	Name          *string
	Slug          *string
	Description   *string
	Readme        *string
	RepositoryURL *string
}

// ListProjects returns a page of an org's live projects.
func (s *Service) ListProjects(ctx context.Context, a Actor, orgSlug string, q paginate.Query) ([]db.Project, string, error) {
	projects, next, err := s.store.ListProjects(ctx, a.UserID, orgSlug, q)
	return projects, next, classify(err)
}

// ListDeletedProjects returns a page of an org's soft-deleted projects.
func (s *Service) ListDeletedProjects(ctx context.Context, a Actor, orgSlug string, q paginate.Query) ([]db.Project, string, error) {
	projects, next, err := s.store.ListDeletedProjects(ctx, a.UserID, orgSlug, q)
	return projects, next, classify(err)
}

// GetProject returns one project.
func (s *Service) GetProject(ctx context.Context, a Actor, orgSlug, projectSlug string) (db.Project, error) {
	p, err := s.store.GetProject(ctx, a.UserID, orgSlug, projectSlug)
	return p, classify(err)
}

// CreateProject creates a project in an org.
func (s *Service) CreateProject(ctx context.Context, a Actor, orgSlug string, in CreateProjectInput) (db.Project, error) {
	name, slug, err := nameAndSlug(in.Name, in.Slug)
	if err != nil {
		return db.Project{}, err
	}
	p, err := s.store.CreateProject(ctx, a.UserID, orgSlug, db.ProjectInput{
		Name:          name,
		Slug:          slug,
		Description:   strings.TrimSpace(in.Description),
		Readme:        in.Readme,
		RepositoryURL: strings.TrimSpace(in.RepositoryURL),
	})
	return p, classify(err)
}

// UpdateProject applies a partial edit to a project.
func (s *Service) UpdateProject(ctx context.Context, a Actor, orgSlug, projectSlug string, in UpdateProjectInput) (db.Project, error) {
	name, slug, err := renameFields(in.Name, in.Slug)
	if err != nil {
		return db.Project{}, err
	}
	p, err := s.store.UpdateProject(ctx, a.UserID, orgSlug, projectSlug, db.ProjectUpdate{
		Name:          name,
		Slug:          slug,
		Description:   in.Description,
		Readme:        in.Readme,
		RepositoryURL: in.RepositoryURL,
	})
	return p, classify(err)
}

// DeleteProject soft-deletes a project (restorable; its slug is freed).
func (s *Service) DeleteProject(ctx context.Context, a Actor, orgSlug, projectSlug string) (db.Project, error) {
	p, err := s.store.SetProjectDeleted(ctx, a.UserID, orgSlug, projectSlug, true)
	return p, classify(err)
}

// RestoreProject restores a soft-deleted project deleted within
// db.DeletedRetention, optionally under a new slug (required when its old slug
// was taken by a live project meanwhile: 409 otherwise). Outside the window the
// project is gone (404), matching org restore.
func (s *Service) RestoreProject(ctx context.Context, a Actor, orgSlug, projectSlug, newSlug string) (db.Project, error) {
	slug := ""
	if strings.TrimSpace(newSlug) != "" {
		slug = Slugify(newSlug)
		if slug == "" {
			return db.Project{}, Invalid("slug must contain a letter or digit")
		}
	}
	p, err := s.store.RestoreProject(ctx, a.UserID, orgSlug, projectSlug, slug)
	return p, classify(err, restoreProjectOverrides...)
}

// ListProjectMembers returns a page of a project's explicit collaborators.
func (s *Service) ListProjectMembers(ctx context.Context, a Actor, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectMember, string, error) {
	members, next, err := s.store.ListProjectMembers(ctx, a.UserID, orgSlug, projectSlug, q)
	return members, next, classify(err, projectMemberOverrides...)
}

// AddProjectMember grants an org member a role on a project and tells them.
func (s *Service) AddProjectMember(ctx context.Context, a Actor, orgSlug, projectSlug, login, role string) (string, error) {
	login, role = strings.TrimSpace(login), strings.TrimSpace(role)
	if login == "" || role == "" {
		return "", Invalid("login and role are required")
	}
	targetID, err := s.store.AddProjectMember(ctx, a.UserID, orgSlug, projectSlug, login, role)
	if err != nil {
		return "", classify(err, projectMemberOverrides...)
	}
	s.notify(ctx, targetID, nil, "project.access_granted",
		"You were added to a project",
		"You now have "+role+" access to "+projectSlug+".",
		"/"+orgSlug+"/projects/"+projectSlug)
	return targetID, nil
}

// SetProjectMemberRole changes a collaborator's project role and tells them.
func (s *Service) SetProjectMemberRole(ctx context.Context, a Actor, orgSlug, projectSlug, userID, role string) error {
	userID, role = strings.TrimSpace(userID), strings.TrimSpace(role)
	if userID == "" || role == "" {
		return Invalid("user_id and role are required")
	}
	if err := s.store.SetProjectMemberRole(ctx, a.UserID, orgSlug, projectSlug, userID, role); err != nil {
		return classify(err, projectMemberOverrides...)
	}
	s.notify(ctx, userID, nil, "project.access_changed",
		"Your project role changed",
		"Your role on "+projectSlug+" is now "+role+".",
		"/"+orgSlug+"/projects/"+projectSlug)
	return nil
}

// RemoveProjectMember revokes a collaborator's project grant.
func (s *Service) RemoveProjectMember(ctx context.Context, a Actor, orgSlug, projectSlug, userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return Invalid("user_id is required")
	}
	return classify(s.store.RemoveProjectMember(ctx, a.UserID, orgSlug, projectSlug, userID), projectMemberOverrides...)
}

// ListProjectTeams returns a page of the teams granted a role on a project.
func (s *Service) ListProjectTeams(ctx context.Context, a Actor, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectTeam, string, error) {
	teams, next, err := s.store.ListProjectTeams(ctx, a.UserID, orgSlug, projectSlug, q)
	return teams, next, classify(err)
}

// AddProjectTeam grants a team a role on a project.
func (s *Service) AddProjectTeam(ctx context.Context, a Actor, orgSlug, projectSlug, teamSlug, role string) error {
	teamSlug, role = strings.TrimSpace(teamSlug), strings.TrimSpace(role)
	if teamSlug == "" || role == "" {
		return Invalid("team and role are required")
	}
	return classify(s.store.AddProjectTeam(ctx, a.UserID, orgSlug, projectSlug, teamSlug, role))
}

// SetProjectTeamRole changes a team's role on a project.
func (s *Service) SetProjectTeamRole(ctx context.Context, a Actor, orgSlug, projectSlug, teamSlug, role string) error {
	teamSlug, role = strings.TrimSpace(teamSlug), strings.TrimSpace(role)
	if teamSlug == "" || role == "" {
		return Invalid("team and role are required")
	}
	return classify(s.store.SetProjectTeamRole(ctx, a.UserID, orgSlug, projectSlug, teamSlug, role))
}

// RemoveProjectTeam revokes a team's access to a project.
func (s *Service) RemoveProjectTeam(ctx context.Context, a Actor, orgSlug, projectSlug, teamSlug string) error {
	teamSlug = strings.TrimSpace(teamSlug)
	if teamSlug == "" {
		return Invalid("team is required")
	}
	return classify(s.store.RemoveProjectTeam(ctx, a.UserID, orgSlug, projectSlug, teamSlug))
}

// ListProjectOwners returns a page of a project's owners (users and teams).
func (s *Service) ListProjectOwners(ctx context.Context, a Actor, orgSlug, projectSlug string, q paginate.Query) ([]db.ProjectOwner, string, error) {
	owners, next, err := s.store.ListProjectOwners(ctx, a.UserID, orgSlug, projectSlug, q)
	return owners, next, classify(err)
}

// AddProjectOwner makes a user (login = email/username) or a team (login = team
// slug) an owner of a project. Returns the added principal's id.
func (s *Service) AddProjectOwner(ctx context.Context, a Actor, orgSlug, projectSlug, ownerType, login string) (string, error) {
	ownerType, login = strings.TrimSpace(ownerType), strings.TrimSpace(login)
	if ownerType == "" || login == "" {
		return "", Invalid("type and login are required")
	}
	id, err := s.store.AddProjectOwner(ctx, a.UserID, orgSlug, projectSlug, ownerType, login)
	return id, classify(err)
}

// RemoveProjectOwner removes a user or team owner (by principal id).
func (s *Service) RemoveProjectOwner(ctx context.Context, a Actor, orgSlug, projectSlug, ownerType, principalID string) error {
	ownerType, principalID = strings.TrimSpace(ownerType), strings.TrimSpace(principalID)
	if ownerType == "" || principalID == "" {
		return Invalid("type and principal_id are required")
	}
	return classify(s.store.RemoveProjectOwner(ctx, a.UserID, orgSlug, projectSlug, ownerType, principalID))
}
