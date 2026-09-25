package service

import (
	"errors"
	"net/http"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// Error is a classified domain failure: an HTTP-style status plus a message that
// is safe to show a caller. It wraps the underlying cause, so errors.Is still
// matches the original sentinel (e.g. db.ErrForbidden).
//
// Every front door renders the same Error the same way: the REST API as the
// status + message, ai-execute-action as the status, the MCP server and the
// in-product agent as the message. Anything that is NOT an Error (after
// Classify) is an internal fault whose details must never reach a caller.
type Error struct {
	Status  int
	Message string
	Err     error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Err }

// ErrInvalidInput is the sentinel behind every input-validation Error (422).
var ErrInvalidInput = errors.New("invalid input")

// ErrNotFound is the sentinel behind a generic not-found Error (404) that has no
// more specific domain sentinel (e.g. an unknown documentation page).
var ErrNotFound = errors.New("not found")

// Invalid is a 422 validation failure with a caller-facing message.
func Invalid(msg string) error {
	return &Error{Status: http.StatusUnprocessableEntity, Message: msg, Err: ErrInvalidInput}
}

// NotFound is a 404 with a caller-facing message.
func NotFound(msg string) error {
	return &Error{Status: http.StatusNotFound, Message: msg, Err: ErrNotFound}
}

// mapping is one row of the error table.
type mapping struct {
	status int
	msg    string
}

// errorTable is THE mapping from domain sentinels to a status and a safe
// message. It replaces the per-resource mappers the HTTP layer used to carry, so
// a sentinel means the same thing on every surface. Context-specific wording
// (the same sentinel reading differently for, say, projects vs. org members) is
// expressed as an Override at the service call site, not as another mapper.
var errorTable = map[error]mapping{
	paginate.ErrBadCursor: {http.StatusUnprocessableEntity, "invalid pagination cursor"},

	// Organizations + membership.
	db.ErrNotMember:       {http.StatusNotFound, "organization not found"},
	db.ErrForbidden:       {http.StatusForbidden, "you don't have permission to do that"},
	db.ErrOrgSlugTaken:    {http.StatusConflict, "that org slug is already taken"},
	db.ErrOrgLimitReached: {http.StatusPaymentRequired, "the free plan includes one organization; add a payment method to create more"},
	db.ErrSoleOwner:       {http.StatusConflict, "you're the only owner; transfer ownership or delete the organization first"},
	db.ErrUsernameTaken:   {http.StatusConflict, "that username is already taken"},
	db.ErrInvalidRole:     {http.StatusUnprocessableEntity, "invalid role"},
	db.ErrUserNotFound:    {http.StatusNotFound, "no user with that email or username"},
	db.ErrAlreadyMember:   {http.StatusConflict, "that user is already a member"},
	db.ErrTargetNotMember: {http.StatusConflict, "that user must be an organization member first"},
	db.ErrLastOwner:       {http.StatusConflict, "an organization must always have an owner"},
	db.ErrSelfManage:      {http.StatusConflict, "you can't change your own membership here; use Leave instead"},

	db.ErrInvalidBasePermission: {http.StatusUnprocessableEntity, "invalid base permission"},

	// Projects.
	db.ErrProjectNotFound:     {http.StatusNotFound, "project not found"},
	db.ErrProjectSlugTaken:    {http.StatusConflict, "a project with that slug already exists"},
	db.ErrAlreadyCollaborator: {http.StatusConflict, "that user already has a role on this project"},
	db.ErrNotCollaborator:     {http.StatusNotFound, "that user has no role on this project"},
	db.ErrAlreadyTeamGrant:    {http.StatusConflict, "that team already has a role on this project"},
	db.ErrNotTeamGrant:        {http.StatusNotFound, "that team has no role on this project"},
	db.ErrAlreadyOwner:        {http.StatusConflict, "that principal already owns this project"},
	db.ErrNotOwner:            {http.StatusNotFound, "that principal does not own this project"},
	db.ErrInvalidOwnerType:    {http.StatusUnprocessableEntity, "owner type must be user or team"},

	// Teams.
	db.ErrTeamNotFound:      {http.StatusNotFound, "team not found"},
	db.ErrTeamSlugTaken:     {http.StatusConflict, "a team with that slug already exists"},
	db.ErrAlreadyTeamMember: {http.StatusConflict, "that user is already on this team"},
	db.ErrNotTeamMember:     {http.StatusNotFound, "that user is not on this team"},

	// Invitations.
	db.ErrInviteExists:        {http.StatusConflict, "a pending invitation already exists for that email"},
	db.ErrInviteNotFound:      {http.StatusNotFound, "invitation not found"},
	db.ErrInviteNotPending:    {http.StatusConflict, "this invitation is no longer valid"},
	db.ErrInviteExpired:       {http.StatusGone, "this invitation has expired"},
	db.ErrInviteEmailMismatch: {http.StatusForbidden, "this invitation was sent to a different email address"},
}

// Override rewords (or re-statuses) one sentinel for a specific call site, e.g.
// ErrTargetNotMember reads "that user is not a member" when managing org members
// but "must be an organization member first" when granting project access.
type Override struct {
	Err     error
	Status  int
	Message string
}

// Classify resolves err to a caller-safe Error. An err that already is (or
// wraps) an *Error is returned as-is; otherwise the first matching Override,
// then the table, decides. ok=false means err is an internal fault: callers must
// report a generic failure and log the detail, never echo err.Error().
func Classify(err error, overrides ...Override) (*Error, bool) {
	if err == nil {
		return nil, false
	}
	var se *Error
	if errors.As(err, &se) {
		return se, true
	}
	for _, o := range overrides {
		if errors.Is(err, o.Err) {
			return &Error{Status: o.Status, Message: o.Message, Err: err}, true
		}
	}
	for sentinel, m := range errorTable {
		if errors.Is(err, sentinel) {
			return &Error{Status: m.status, Message: m.msg, Err: err}, true
		}
	}
	return nil, false
}

// classify is the service boundary's wrapper: known failures become an *Error
// (honoring the call site's overrides), unknown ones pass through untouched so
// they surface as internal errors.
func classify(err error, overrides ...Override) error {
	if err == nil {
		return nil
	}
	if e, ok := Classify(err, overrides...); ok {
		return e
	}
	return err
}

// PublicMessage is the caller-safe text for err: the classified message, or a
// generic line for an internal fault (whose detail stays in the server logs).
func PublicMessage(err error) string {
	if e, ok := Classify(err); ok {
		return e.Message
	}
	return "something went wrong; please try again"
}

// Call-site override sets. Each exists because the same sentinel reads
// differently in that context; everything else falls through to the table.
var (
	// Managing org members directly: the target is simply "not a member".
	memberOverrides = []Override{
		{db.ErrTargetNotMember, http.StatusNotFound, "that user is not a member"},
	}
	// Managing a collaborator's project access (the actor's own org access is
	// managed elsewhere).
	projectMemberOverrides = []Override{
		{db.ErrSelfManage, http.StatusConflict, "you can't change your own access here"},
	}
	// Inviting: an unknown login is an input problem (not an email, not a user).
	inviteOverrides = []Override{
		{db.ErrUserNotFound, http.StatusUnprocessableEntity, "enter an email address to invite, or the username of an existing user"},
	}
	// Leaving: the caller themself is not a member.
	leaveOverrides = []Override{
		{db.ErrNotMember, http.StatusNotFound, "you are not a member of that organization"},
	}
	// Deleting an org: only an owner may.
	deleteOrgOverrides = []Override{
		{db.ErrForbidden, http.StatusForbidden, "only an organization owner can delete it"},
	}
	// Restoring an org: the org is looked up in the caller's recently deleted
	// archive, and a taken slug means choosing a new one.
	// Restoring a project: only projects deleted within the retention window are
	// restorable, and a taken slug means choosing a new one.
	restoreProjectOverrides = []Override{
		{db.ErrProjectNotFound, http.StatusNotFound, "no restorable project with that slug"},
		{db.ErrProjectSlugTaken, http.StatusConflict, "that project slug is now taken; restore it under a new slug"},
	}
	restoreOrgOverrides = []Override{
		{db.ErrNotMember, http.StatusNotFound, "no restorable organization with that id"},
		{db.ErrForbidden, http.StatusForbidden, "only an organization owner can restore it"},
		{db.ErrOrgSlugTaken, http.StatusConflict, "that org slug is now taken; restore it under a new slug"},
		{db.ErrOrgLimitReached, http.StatusPaymentRequired, "the free plan includes one organization; add a payment method to restore another"},
	}
)
