package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// TestProjectToolsEnforceProjectAccess proves the agent/MCP project tools apply
// the same per-project access rule as the REST API (they call the same service
// layer): with base permission none a member cannot list or get a project (404);
// with base read they can view but not update (403); a direct write grant lets
// them update. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestProjectToolsEnforceProjectAccess(t *testing.T) {
	base := os.Getenv("FLAGON_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("set FLAGON_TEST_DATABASE_URL to run database integration tests")
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parse FLAGON_TEST_DATABASE_URL: %v", err)
	}
	appURL := *u
	appURL.User = url.UserPassword("flagon_app", "flagon_app_test_pw")
	cfg := db.Config{MigratorURL: base, AppURL: appURL.String()}

	ctx := context.Background()
	if err := db.Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := db.Open(ctx, cfg)
	defer d.Close()

	n := strconv.FormatInt(time.Now().UnixNano(), 36)
	owner, member := "tool-owner-"+n, "tool-member-"+n
	memberEmail := member + "@example.com"
	org := "tool-co-" + n
	if _, _, err := d.Me(ctx, member, memberEmail); err != nil {
		t.Fatalf("Me: %v", err)
	}
	if _, err := d.CreateOrg(ctx, owner, owner+"@example.com", "Tool Co", org); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	if _, _, err := d.AddMember(ctx, owner, org, memberEmail, db.RoleMember); err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	if _, err := d.CreateProject(ctx, owner, org, db.ProjectInput{Name: "App", Slug: "app"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	setBase := func(b string) {
		t.Helper()
		if err := d.SetOrgSecurity(ctx, owner, org, db.OrgSecurity{BasePermission: b}); err != nil {
			t.Fatalf("SetOrgSecurity %s: %v", b, err)
		}
	}

	reg := NewRegistry(service.New(d), fakeDocs{})
	tc := ToolContext{UserID: member, Email: memberEmail}
	call := func(name string, in map[string]any) (any, error) {
		t.Helper()
		tool, ok := reg.Get(name)
		if !ok {
			t.Fatalf("tool %s not registered", name)
		}
		raw, _ := json.Marshal(in)
		return tool.Run(ctx, tc, raw)
	}
	status := func(err error) int {
		var se *service.Error
		if errors.As(err, &se) {
			return se.Status
		}
		return 0
	}
	listed := func() int {
		t.Helper()
		out, err := call("list_projects", map[string]any{"org": org})
		if err != nil {
			t.Fatalf("list_projects: %v", err)
		}
		return len(out.(map[string]any)["projects"].([]db.Project))
	}
	get := map[string]any{"org": org, "project": "app"}
	update := map[string]any{"org": org, "project": "app", "description": "edited by the agent"}

	setBase(db.BasePermissionNone)
	if got := listed(); got != 0 {
		t.Fatalf("base none: list_projects returned %d, want 0", got)
	}
	if _, err := call("get_project", get); status(err) != 404 {
		t.Fatalf("base none: get_project err = %v, want 404", err)
	}
	if _, err := call("update_project", update); status(err) != 404 {
		t.Fatalf("base none: update_project err = %v, want 404", err)
	}

	setBase(db.ProjectRoleRead)
	if got := listed(); got != 1 {
		t.Fatalf("base read: list_projects returned %d, want 1", got)
	}
	if _, err := call("get_project", get); err != nil {
		t.Fatalf("base read: get_project: %v", err)
	}
	if _, err := call("update_project", update); status(err) != 403 {
		t.Fatalf("base read: update_project err = %v, want 403", err)
	}

	if _, err := d.AddProjectMember(ctx, owner, org, "app", memberEmail, db.ProjectRoleWrite); err != nil {
		t.Fatalf("AddProjectMember: %v", err)
	}
	if _, err := call("update_project", update); err != nil {
		t.Fatalf("write grant: update_project: %v", err)
	}
}
